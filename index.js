const StreamrClient = require("streamr-client");

const axios = require('axios');

require("dotenv").config();

const dataUnionObject = {
    contractAddress: process.env.DU_CONTRACT_ADDRESS,
    sidechainAddress: process.env.DU_SIDE_CHAIN_ADDRESS,
    secret: process.env.DU_SECRET,
    minimumToWithdraw: 0,
};

const withdraw = async (queryParams) => {
    const {
        secretKey,
    } = queryParams;

    if (!secretKey) {
        return null;
    }

    const client = new StreamrClient({
        auth: {
            privateKey: secretKey,
        }
    });

    const recipientAddress = process.env.MAT_WALLET;

    const from = await client.getAddress();

    const dataUnion = await client.safeGetDataUnion(dataUnionObject.contractAddress);

    const memberStats = await getMemberStats(dataUnion, from);

    if (parseFloat(memberStats.stats.dataToCop) < dataUnionObject.minimumToWithdraw) {
        return {
            error: 'Minimum amount to withdraw is 10,000 COP',
            status: 409,
        };
    }

    const signature = await dataUnion.signWithdrawAllTo(recipientAddress);

    let receipt = null;

    try {
        receipt = await dataUnion.withdrawAllToSigned(
            from,
            recipientAddress,
            signature, 
            {
                sendToMainnet: false //xdai = false , eth = true
            },
        );
    } catch (exception) {
        return {
            status: 500,
            exception: exception.stack,
            memberStats,
            from,
            recipientAddress,
        };
    }

    if (receipt.from === from && receipt.transactionHash) { // if transaction success -> send coins to MAT
        await _sendToMAT({
            receipt,
            memberStats
        });
    }

    return {
        status: 200,
        signature,
        from,
        receipt,
        // testSend,
    };
};

/**
 * get member stats
 * @param {object} dataUnion
 * @param {String} address
 * @returns mixed
 */
const getMemberStats = async (dataUnion, address) => {
    let response = {
        status: 200,
        stats: {},
    };

    try {
        response.stats = await dataUnion.getMemberStats(address);

        // earningsBeforeLastJoin
        response.stats.earningsBeforeLastJoin = _convertToInt(response.stats.earningsBeforeLastJoin._hex);

        response.stats.totalEarnings = _convertToInt(response.stats.totalEarnings._hex);

        response.stats.withdrawableEarnings = _convertToInt(response.stats.withdrawableEarnings._hex);

        response.stats.dataToCop = await convertDataToCop(response.stats.withdrawableEarnings);
        // get provider from eth_address
    } catch (exception) {
        response = {
            status: 404,
            exception: exception.stack,
        };
    }

    return response;
};

const _convertToInt = (hex) => {
    return parseFloat(parseInt(hex, 16) / 1000000000000000000).toFixed(4);
}

/**
 * send request to MAT
 * @param {object} data
 * @author Miguel Trevino
 */
const _sendToMAT = async (params) => {
    try {
        // const {
        //     data,
        // } = await axios.post(process.env.WITHDRAW_URL,
        console.log("%o", {
            amount: params.memberStats.stats.dataToCop, // amount in COP
            SECRET_KEY: process.env.MAT_SECRET_KEY, // SECRET KEY
            eth_address: params.receipt.from, // your wallet
            ethAddress: params.receipt.from,
            transactionHash: params.receipt.transactionHash,
        });
    } catch (exception) {
        console.error({
            // exception,
            response: exception.response,
            data: exception.response.data,
        });
    }
};

/**
 * convert data to COP
 * @param {Number} totalEarnings
 * @returns mixed
 */
const convertDataToCop = async (totalEarnings) => {
    const dolarCop = 3941;

    let kline;

    try {
        const {
            data
        } = await axios.get('https://api.binance.com/api/v3/klines?symbol=DATAUSDT&interval=1m&limit=1');

        kline = data[0];
    } catch (error) {
        return 'binanceServiceNotAvailable'
    }

    const streamrDataBinance = {
        open: parseFloat(kline[1]),
        high: parseFloat(kline[2]),
        low: parseFloat(kline[3]),
        close: parseFloat(kline[4])
    };

    return parseInt(parseFloat(totalEarnings) * streamrDataBinance.close * dolarCop);
}

async function main() {
    const secretKey = process.env.MEMBER_SECRET_KEY;
    console.log(await withdraw({ secretKey }));
};
main().catch(console.error);
