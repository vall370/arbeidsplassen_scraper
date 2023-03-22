const { PrismaClient } = require("@prisma/client")
const prisma = new PrismaClient()
const Promise = require('bluebird');

async function main() {
    let ids = await prisma.job_listing.findMany({
        select: {
            id: true,
        },
        where: {
            status: 'ACTIVE'
        }
    })
    ids = ids.map(i => {
        return {
            id: i.id,
            url: `https://arbeidsplassen.nav.no/stillinger/api/stilling/${i.id}`
        }
    })
    const concurrencyLimit = 10;
    const fetchData = async url => {
        try {
            const response = await fetch(url.url);
            if (!response.ok) {
                throw new Error(`Failed to fetch data from ${url}`);
            }
            return response.json();
        } catch (error) {
            console.error(`Error fetching data from ${url}: ${error.message}`);
            return null;
        }
    };
    Promise.map(ids, fetchData, { concurrency: concurrencyLimit })
        .then(async data => {
            const newData = data.map(jobAd => {
                if (jobAd['_source']['status'] !== 'ACTIVE')
                    return {
                        id: jobAd['_id'],
                        status: jobAd['_source']['status'] || null,
                    }
            }).filter(y => y !== undefined);
            console.log(newData);
            for (const data of newData) {
                const updateUser = await prisma.job_listing.update({
                    where: {
                        id: data.id,
                    },
                    data: {
                        status: data.status,
                    },
                })
            }

        })
        .catch(error => {
            console.error(`Error fetching data: ${error.message}`);
        });
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