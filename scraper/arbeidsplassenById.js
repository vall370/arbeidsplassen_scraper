const { PrismaClient } = require("@prisma/client")
const prisma = new PrismaClient()
const axios = require('axios');

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

    const fetchBatchData = async urls => {
        const requests = urls.map(url => axios.get(url.url));
        const responses = await Promise.allSettled(requests);
        const data = responses.map(response => {
            if (response.status === 'fulfilled') {
                return response.value.data;
            } else {
                // if not fulfilled, link is inactive. Therefore status should be INACTIVE
                const id = response.reason.config.url.split('https://arbeidsplassen.nav.no/stillinger/api/stilling/')[1]
                const obj = { '_id': id, '_source': { 'status': 'INACTIVE' } }
                console.log(obj)
                return { '_id': id, '_source': { 'status': 'INACTIVE' } }
            }
        });
        return data.filter(Boolean);
    };
    const createBatchOfUpdates = async () => {
        const arrayOfUpdates = []
        const batchedIds = []; // Array of arrays, each containing a batch of ids
        const batchSize = 10; // The number of ids to include in each batch
        for (let i = 0; i < ids.length; i += batchSize) {
            batchedIds.push(ids.slice(i, i + batchSize));
        }
        for (const batch of batchedIds) {
            // console.log(batch);
            const data = await fetchBatchData(batch)

            const newData = data.map(item => {
                if (item['_source']['status'] !== 'ACTIVE') {
                    return {
                        id: item['_id'],
                        status: item['_source']['status']
                    }
                }

            }).filter(x => x !== undefined)
            for (const obj of newData) {
                arrayOfUpdates.push({ where: { id: obj.id }, data: { status: obj.status } })
            }
        }
        return arrayOfUpdates
    }

    const i = await createBatchOfUpdates()
    for (const obj of i) {
        await prisma.job_listing.update(obj)
    }
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