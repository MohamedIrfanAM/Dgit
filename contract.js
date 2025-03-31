const { Contract } = require('fabric-contract-api');
const ipfsClient = require('ipfs-http-client');

class DocumentContract extends Contract {
    constructor() {
        super('DocumentContract');
    }

    async beforeTransaction(ctx) {
        // Initialize IPFS client
        this.ipfs = ipfsClient({
            host: 'localhost',
            port: '5001',
            protocol: 'http'
        });
    }

    async uploadDocument(ctx, documentContents) {
        // verify weather the developer has access or not
        const clientMSP = ctx.clientIdentity.getMSPID();
        const clientRole = ctx.clientIdentity.getAttributeValue('hf.Affiliation');

        // for time being the role of the only admins are allowed to write to the blockchain
        if (clientRole !== 'admin') {
            throw new Error(`User ${ctx.clientIdentity.getID()} doesn't have write access`);
        }

        // upload document to the ipfs
        const { cid } = await this.ipfs.add(documentContents);
 
        // make metadata structure
        const docMetadata = {
            cid: cid.toString(),
            author: ctx.clientIdentity.getID(),
            timestamp: new Date().toISOString(),
            organization: clientMSP
        };

        // invoke smart contract to store the metadata
        await ctx.stub.putState(cid.toString(), Buffer.from(JSON.stringify(docMetadata)));
        return cid.toString();
    }

    async viewDocument(ctx, cid) {
        const metadataBytes = await ctx.stub.getState(cid);
        if (!metadataBytes || metadataBytes.length === 0) {
            throw new Error(`Document ${cid} does not exist`);
        }
        
        const metadata = JSON.parse(metadataBytes.toString());
        
        // Get document from IPFS
        const chunks = [];
        for await (const chunk of this.ipfs.cat(cid)) {
            chunks.push(chunk);
        }
        
        return {
            metadata: metadata,
            content: Buffer.concat(chunks).toString()
        };
    }

    async getDocumentHistory(ctx, cid) {
        const iterator = await ctx.stub.getHistoryForKey(cid);
        const results = [];
        
        while (true) {
            const res = await iterator.next();
            if (res.value && res.value.value) {
                results.push({
                    txId: res.value.txId,
                    timestamp: res.value.timestamp,
                    data: JSON.parse(res.value.value.toString('utf8'))
                });
            }
            if (res.done) {
                await iterator.close();
                return results;
            }
        }
    }
}

module.exports = DocumentContract;
