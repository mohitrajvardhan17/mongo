// Test transactions including multi-deletes
// @tags: [uses_transactions]
(function() {
    "use strict";

    const dbName = "test";
    const collName = "multi_delete_in_transaction";
    const testDB = db.getSiblingDB(dbName);
    const testColl = testDB[collName];

    testColl.drop();
    assert.commandWorked(
        testDB.createCollection(testColl.getName(), {writeConcern: {w: "majority"}}));
    let txnNumber = 0;

    const sessionOptions = {causalConsistency: false};
    const session = db.getMongo().startSession(sessionOptions);
    const sessionDb = session.getDatabase(dbName);

    jsTest.log("Prepopulate the collection.");
    assert.writeOK(testColl.insert([{_id: 0, a: 0}, {_id: 1, a: 0}, {_id: 2, a: 1}],
                                   {writeConcern: {w: "majority"}}));

    jsTest.log("Do an empty multi-delete.");
    let res = assert.commandWorked(sessionDb.runCommand({
        delete: collName,
        deletes: [{q: {a: 99}, limit: 0}],
        readConcern: {level: "snapshot"},
        txnNumber: NumberLong(txnNumber),
        autocommit: false
    }));
    assert.eq(0, res.n);

    res = assert.commandWorked(
        sessionDb.runCommand({find: collName, filter: {}, txnNumber: NumberLong(txnNumber)}));
    assert.docEq(res.cursor.firstBatch, [{_id: 0, a: 0}, {_id: 1, a: 0}, {_id: 2, a: 1}]);

    assert.commandWorked(sessionDb.runCommand({
        commitTransaction: 1,
        txnNumber: NumberLong(txnNumber++),
        // TODO(russotto): Majority write concern on commit is to avoid a WriteConflictError
        // writing to the transaction table.
        writeConcern: {w: "majority"}
    }));

    jsTest.log("Do a single-result multi-delete.");
    res = assert.commandWorked(sessionDb.runCommand({
        delete: collName,
        deletes: [{q: {a: 1}, limit: 0}],
        readConcern: {level: "snapshot"},
        txnNumber: NumberLong(txnNumber),
        autocommit: false
    }));
    assert.eq(1, res.n);
    res = assert.commandWorked(
        sessionDb.runCommand({find: collName, filter: {}, txnNumber: NumberLong(txnNumber)}));
    assert.docEq(res.cursor.firstBatch, [{_id: 0, a: 0}, {_id: 1, a: 0}]);

    assert.commandWorked(sessionDb.runCommand(
        {commitTransaction: 1, txnNumber: NumberLong(txnNumber++), writeConcern: {w: "majority"}}));

    jsTest.log("Do a multiple-result multi-delete.");
    res = assert.commandWorked(sessionDb.runCommand({
        delete: collName,
        deletes: [{q: {a: 0}, limit: 0}],
        readConcern: {level: "snapshot"},
        txnNumber: NumberLong(txnNumber),
        autocommit: false
    }));
    assert.eq(2, res.n);
    res = assert.commandWorked(
        sessionDb.runCommand({find: collName, filter: {}, txnNumber: NumberLong(txnNumber)}));
    assert.docEq(res.cursor.firstBatch, []);

    assert.commandWorked(sessionDb.runCommand(
        {commitTransaction: 1, txnNumber: NumberLong(txnNumber++), writeConcern: {w: "majority"}}));

    // Collection should be empty.
    assert.eq(0, testColl.find().itcount());
}());
