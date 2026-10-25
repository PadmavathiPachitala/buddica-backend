const mongoose = require("mongoose");

function connectToDb() {
    return mongoose.connect(process.env.MONGO_URI)
        .then(() => {
            console.log("Server is connected to database successfully");
            const topDesc = mongoose.connection.client?.topology?.description;
            const isReplicaSet = Boolean(topDesc?.type?.includes("ReplicaSet") || topDesc?.setName);
            if (isReplicaSet) {
                console.log("[MongoDB] Topology: Replica Set. Native multi-document ACID transactions enabled.");
            } else {
                console.log("[MongoDB] Topology: Standalone (single node). Using atomic conditional ledger fallback.");
            }
        })
        .catch((err) => {
            console.error("Database connection failed:", err.message);
            process.exit(1);
        });
}

module.exports = connectToDb;
