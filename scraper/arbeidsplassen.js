const puppeteer = require('puppeteer');
const links = require('./arbeidsplassen.json');
const { PrismaClient } = require("@prisma/client")
const Promise = require('bluebird');
const path = require("path");

const prisma = new PrismaClient()

/**

    Returns the number of annonser found on the page.
    @param {Page} page - The puppeteer page object to interact with.
    @return {Promise<number>} The number of annonser found on the page.
    @throws {Error} If the number of annonser could not be found.
    */
async function getAnnonserCount(page) {
    const h2Selector = "h2.SearchResultCount";
    await page.waitForSelector(h2Selector);
    const h2Text = await page.$eval(h2Selector, (h2) => h2.textContent);
    const annonserRegex = /(\d+)\sannonser/;
    const match = annonserRegex.exec(h2Text);
    if (match !== null) {
        return parseInt(match[1]);
    } else {
        throw new Error("Could not find number of annonser");
    }
}
async function main() {
    const browser = await puppeteer.launch({
        args: ["--window-size=1920,1080", "--no-sandbox"],
    });

    const page = await browser.newPage();

    await page.setViewport({ width: 1920, height: 1080 });
    await page.goto("https://arbeidsplassen.nav.no/stillinger", {
        waitUntil: "networkidle0",
    });
    const arr = [];
    for (const url of links) {
        await page.goto(url.url, {
            waitUntil: "networkidle0",
        });
        await page.waitForSelector(".SearchResultCount");

        const annonserCount = await getAnnonserCount(page);
        console.log(annonserCount);
        arr.push(annonserCount);
        const urlWithHighestNumber = `${url.url}&to=${annonserCount}`;
        await page.goto(urlWithHighestNumber, {
            waitUntil: "networkidle0",
        });
        await page.waitForSelector("#resultat");
        const articles = await page.$$eval("#resultat > article", (articles) => {
            return articles.map((article) => {
                const jobTitle = article.querySelector(".SearchResultsItem__jobtitle");
                const employer = article.querySelector(".SearchResultsItem__employer");
                const location = article.querySelector(".SearchResultsItem__location");
                const dueDate = article.querySelector(
                    ".SearchResultsItem__applicationdue"
                );
                const publishedDate = article.querySelector(
                    ".SearchResultsItem__published"
                );
                const link = article.querySelector(".navds-link");
                const tag = article.querySelector(".navds-tag");
                console.log(link);
                let id = null;
                let href = link ? link.getAttribute("href") : null;

                if (href && href.includes("www.finn.no")) {
                    href = href.replace("https://arbeidsplassen.nav.no", "");
                    id = href.split("/")[3];
                }
                if (href && href.includes("/stillinger/stilling/")) {
                    href = `https://arbeidsplassen.nav.no${href}`;
                    id = href.split("/")[5];
                }

                return {
                    jobTitle: jobTitle ? jobTitle.textContent.trim() : null,
                    employer: employer ? employer.textContent.trim() : null,
                    location: location ? location.textContent.trim() : null,
                    dueDate: dueDate ? dueDate.textContent.trim() : null,
                    tag: tag ? tag.textContent.trim() : null,
                    publishedDate: publishedDate
                        ? publishedDate.textContent.trim()
                        : null,
                    link: href ? href : null,
                    id: id,
                };
            });
        });
        articles.forEach((x) => {
            arr.push(x);
        });
        // // await page.goto(urlWithHighestNumber);
        // const title = await page.title();
        // function convertUrl(oldUrl) {
        //   const baseUrl = "https://arbeidsplassen.nav.no/stillinger/api/search";
        //   const fromParam = "from=0";
        //   const sizeParam = `size=${oldUrl.match(/\d+$/)[0]}`;
        //   const occupationParam = oldUrl.split("=")[1].replace("&to", "");

        //   const newUrl = `${baseUrl}?${fromParam}&${sizeParam}&occupationFirstLevels[]=${encodeURI(
        //     occupationParam
        //   )}`;
        //   return newUrl;
        // }
        // const res = await fetch(convertUrl(urlWithHighestNumber)).then((res) =>
        //   res.json()
        // );
        // console.log(res.hits);
        // console.log(convertUrl(urlWithHighestNumber));
        // arr.push({ old: urlWithHighestNumber });
    }
    await browser.close();
    //   console.log(
    //     arr
    //       .map((item) => item.link)
    //       .filter((link) => {
    //         if (typeof link !== "undefined")
    //           link.startsWith("https://arbeidsplassen.nav.no/stillinger/stilling");
    //       })
    //   );
    const urls = arr
        .filter(
            (obj) =>
                obj.link &&
                obj.link.startsWith("https://arbeidsplassen.nav.no/stillinger/stilling")
        )
        .map((obj) => obj.link.replace("/stilling/", "/api/stilling/"));


    const adsWithTags = arr
        .filter(
            (obj) =>
                obj.tag && obj.link &&
                obj.link.startsWith("https://arbeidsplassen.nav.no/stillinger/stilling")
        )
        .map((obj) => {
            return {
                id: obj.id,
                tag: obj.tag
            }
        });


    const fetchData = async (url) => {
        try {
            const response = await fetch(url);
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
        .then(async (data) => {
            const newData = data.map((jobAd) => {
                return {
                    id: jobAd["_id"],
                    businessname: jobAd["_source"]["businessName"] || null,
                    medium: jobAd["_source"]["medium"] || null,
                    published: jobAd["_source"]["published"] || null,
                    expires: jobAd["_source"]["expires"] || null,
                    title: jobAd["_source"]["title"] || null,
                    locationlist: jobAd["_source"]["locationList"] || null,
                    contactlist: jobAd["_source"]["contactList"] || null,
                    location: jobAd["_source"]["location"] || null,
                    external_id: jobAd["_source"]["id"] || null,
                    updated: jobAd["_source"]["updated"] || null,
                    properties: jobAd["_source"]["properties"] || null,
                    status: jobAd["_source"]["status"] || null,
                };
            });
            const test = await prisma.job_listing.createMany({
                data: newData,
                skipDuplicates: true,
            });
            console.log(test);
        })
        .catch((error) => {
            console.error(`Error fetching data: ${error.message}`);
        });
    for (const tagObject of adsWithTags) {
        const insertTag = await prisma.job_listing.update({
            where: {
                id: tagObject.id,
            },
            data: {
                fastapply: tagObject.tag,
            },
        })
    }
}
main()
    .then(async () => {
        await prisma.$disconnect();
    })
    .catch(async (e) => {
        console.error(e);
        await prisma.$disconnect();
        process.exit(1);
    });
