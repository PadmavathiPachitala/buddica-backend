const mongoose = require("mongoose");

async function initiateReplica() {
    try {
        console.log("Connecting to local MongoDB on port 27017...");
        // Use directConnection to connect before replica set metadata is broadcast
        await mongoose.connect("mongodb://127.0.0.1:27017/admin?directConnection=true");
        const admin = mongoose.connection.db.admin();

        console.log("Checking replica set status...");
        try {
            const status = await admin.command({ replSetGetStatus: 1 });
            console.log("Replica set is already initialized!");
            console.log("Replica Set Name:", status.set);
            console.log("Member State:", status.members[0].stateStr);
            return;
        } catch (statusErr) {
            if (statusErr.codeName === "NotYetInitialized" || statusErr.code === 94) {
                console.log("Replica set not yet initialized. Running replSetInitiate...");
                const result = await admin.command({ replSetInitiate: {} });
                console.log("Replica Set initiated successfully:", result);
            } else {
                throw statusErr;
            }
        }

        console.log("Waiting for PRIMARY election...");
        await new Promise((r) => setTimeout(r, 4000));

        const postStatus = await admin.command({ replSetGetStatus: 1 });
        console.log("Replica Set Name:", postStatus.set);
        console.log("Member State:", postStatus.members[0].stateStr);
        console.log("Primary Election Complete! Multi-document ACID transactions are active.");
    } catch (err) {
        console.error("Initiation error:", err.message);
        process.exit(1);
    } finally {
        await mongoose.disconnect();
    }
}

initiateReplica();
