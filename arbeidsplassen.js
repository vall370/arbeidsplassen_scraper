const puppeteer = require('puppeteer');
const links = require('./arbeidsplassen.json');
const { PrismaClient } = require("@prisma/client")
const Promise = require('bluebird');

const prisma = new PrismaClient()
async function main() {
    const browser = await puppeteer.launch({
        defaultViewport: null, args: [
            '--window-size=1920,1080',
        ]
    });
    const page = await browser.newPage();

    await page.goto('https://arbeidsplassen.nav.no/stillinger')

    const arr = []

    for (const url of links) {
        await page.goto(url.url)
        await page.waitForSelector('#resultat > div.SearchResult__footer > p');
        const highestNumber = await page.$eval('#resultat > div.SearchResult__footer > p', (element) => {
            const text = element.textContent;
            const numbers = text.match(/\d+/g);
            return Math.max(...numbers);
        });

        const urlWithHighestNumber = `${url.url}&to=${highestNumber}`;
        await page.goto(urlWithHighestNumber)
        await page.waitForSelector("#resultat > div.SearchResult__header > div:nth-child(1) > p")
        const articles = await page.$$eval('#resultat > article', articles => {
            return articles.map(article => {
                const jobTitle = article.querySelector('.SearchResultsItem__jobtitle');
                const employer = article.querySelector('.SearchResultsItem__employer');
                const location = article.querySelector('.SearchResultsItem__location');
                const dueDate = article.querySelector('.SearchResultsItem__applicationdue');
                const publishedDate = article.querySelector('.SearchResultsItem__published');
                const link = article.querySelector('.link');
                let id = null
                let href = link ? link.getAttribute('href') : null;

                if (href && href.includes('www.finn.no')) {
                    href = href.replace('https://arbeidsplassen.nav.no', '');
                    id = href.split('/')[3]
                }
                if (href && href.includes('/stillinger/stilling/')) {
                    href = `https://arbeidsplassen.nav.no${href}`
                    id = href.split('/')[5]

                }

                return {
                    jobTitle: jobTitle ? jobTitle.textContent.trim() : null,
                    employer: employer ? employer.textContent.trim() : null,
                    location: location ? location.textContent.trim() : null,
                    dueDate: dueDate ? dueDate.textContent.trim() : null,
                    publishedDate: publishedDate ? publishedDate.textContent.trim() : null,
                    link: href ? href : null,
                    id: id
                };
            });
        });
        articles.forEach(x => {
            arr.push(x)
        })
    }

    await browser.close();

    const urls = arr.map(item => item.link)
        .filter(link => link.startsWith("https://arbeidsplassen.nav.no/stillinger/stilling"));
    const fetchData = async url => {
        try {
            const response = await fetch(url.replace("/stilling/", "/api/stilling/"));
            if (!response.ok) {
                throw new Error(`Failed to fetch data from ${url}`);
            }
            return response.json();
        } catch (error) {
            console.error(`Error fetching data from ${url}: ${error.message}`);
            return null;
        }
    };
    const concurrencyLimit = 10;
    Promise.map(urls, fetchData, { concurrency: concurrencyLimit })
        .then(async data => {
            const newData = data.map(jobAd => {
                return {
                    id: jobAd['_id'],
                    businessname: jobAd['_source']['businessName'] || null,
                    medium: jobAd['_source']['medium'] || null,
                    published: jobAd['_source']['published'] || null,
                    expires: jobAd['_source']['expires'] || null,
                    title: jobAd['_source']['title'] || null,
                    locationlist: jobAd['_source']['locationList'] || null,
                    contactlist: jobAd['_source']['contactList'] || null,
                    location: jobAd['_source']['location'] || null,
                    external_id: jobAd['_source']['id'] || null,
                    updated: jobAd['_source']['updated'] || null,
                    properties: jobAd['_source']['properties'] || null,
                    status: jobAd['_source']['status'] || null,
                }
            });
            const test = await prisma.job_listing.createMany({ data: newData, skipDuplicates: true, });
            console.log(test);
        })
        .catch(error => {
            console.error(`Error fetching data: ${error.message}`);
        });
    /* for (const url of urls) {
        try {
            const newUrl = url.replace("/stilling/", "/api/stilling/");

            const response = await fetch(newUrl);
            const jobAd = await response.json();

            const jobAdsSchema = {
                id: jobAd['_id'],
                businessName: jobAd['_source']['businessName'] || null,
                medium: jobAd['_source']['medium'] || null,
                published: jobAd['_source']['published'] || null,
                expires: jobAd['_source']['expires'] || null,
                title: jobAd['_source']['title'] || null,
                locationList: jobAd['_source']['locationList'] || null,
                contactList: jobAd['_source']['contactList'] || null,
                // employer: jobAd['_source']['employer'] || null,
                // location: jobAd['_source']['location'] || null,
                // external_id: jobAd['_source']['id'] || null,
                updated: jobAd['_source']['updated'] || null,
                properties: jobAd['_source']['properties'] || null,
                status: jobAd['_source']['status'] || null,
            };
            // console.log(jobAdsSchema);
            const jobListing = await prisma.job_listing.create({
                data: jobAdsSchema
            })
        } catch (error) {
            console.log(error);
        }


    } */
}
main()
    .then(async () => {
        await prisma.$disconnect()
    })
    .catch(async (e) => {
        console.error(e)
        await prisma.$disconnect()
        process.exit(1)
    })