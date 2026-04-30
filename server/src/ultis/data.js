import generateCode from "./generateCode.js"
const prices = [
    {
        min: 0,
        max: 1,
        value: 'DÆ°á»›i 1 triá»‡u',
    },
    {
        min: 1,
        max: 2,
        value: 'Tá»« 1 - 2 triá»‡u',
    },
    {
        min: 2,
        max: 3,
        value: 'Tá»« 2 - 3 triá»‡u',
    },
    {
        min: 3,
        max: 5,
        value: 'Tá»« 3 - 5 triá»‡u',
    },
    {
        min: 5,
        max: 7,
        value: 'Tá»« 5 - 7 triá»‡u',
    },
    {
        min: 7,
        max: 10,
        value: 'Tá»« 7 - 10 triá»‡u',
    },
    {
        min: 10,
        max: 15,
        value: 'Tá»« 10 - 15 triá»‡u',
    },
    {
        min: 15,
        max: 999999,
        value: 'TrÃªn 15 triá»‡u'
    },
]

const areas = [
    {
        min: 0,
        max: 20,
        value: 'DÆ°á»›i 20m'
    },
    {
        min: 20,
        max: 30,
        value: 'Tá»« 20m - 30m'
    },
    {
        min: 30,
        max: 50,
        value: 'Tá»« 30m - 50m'
    },
    {
        min: 50,
        max: 70,
        value: 'Tá»« 50m - 70m'
    },
    {
        min: 70,
        max: 90,
        value: 'Tá»« 70m - 90m'
    },
    {
        min: 90,
        max: 9999999,
        value: 'TrÃªn 90m'
    },
]

export const dataPrice = prices.map(item => ({
    ...item,
    code: generateCode(item.value),
}))
export const dataArea = areas.map(item => ({
    ...item,
    code: generateCode(item.value),
}))





