// Saves sent one at a time, in the order they were made.
//
// The master lists are saved by comparing them with the copy last saved and
// sending what differs (saveMasterToTables in App.jsx). Every change used
// to start its own save at once, with nothing keeping them in order:
//   - two changes to one row could land the wrong way round, leaving the
//     older value stored under the newer one on screen;
//   - an edit could reach the database before the save that created its
//     row, match nothing, and be lost with no error;
//   - the "last saved" copy moved before the database had answered, so a
//     save that failed was never sent again.
//
// The rule here: one save in flight. Changes made meanwhile wait and go out
// together as one catch-up save of the newest state. "Saved" moves only
// when the database has said yes; a failed save stays owed and is tried
// again, by itself after `retryMs` and at the next change.
//
// A retry sends the same difference again, so `save` must be safe to
// repeat (saveMasterToTables keeps the ids of the rows it adds until the
// save succeeds, and adds by upsert).
//
// No database and no React in here, so it can be tested on its own
// (saveQueue.test.js).
//
//   save(prev, next)  sends what differs; resolves when stored, throws if not
//   onSaved()         after a save that leaves nothing owed
//   onError(err)      after a save that failed
//   retryMs           how long before an owed save is tried again by itself
//   setTimer / clearTimer  stand-ins for the tests

export function makeSaveQueue({ save, onSaved, onError, retryMs = 30000, setTimer = setTimeout, clearTimer = clearTimeout }) {
  let saved = null; // what the database holds, as far as this device knows
  let latest = null; // what the screen holds
  let running = false;
  let changes = 0;
  let retryTimer = null;

  async function run() {
    if (running) return;
    running = true;
    if (retryTimer != null) {
      clearTimer(retryTimer);
      retryTimer = null;
    }
    try {
      while (latest !== saved) {
        const target = latest;
        await save(saved, target);
        saved = target;
      }
      running = false;
      if (onSaved) onSaved();
    } catch (err) {
      running = false;
      if (onError) onError(err);
      retryTimer = setTimer(() => {
        retryTimer = null;
        run();
      }, retryMs);
    }
  }

  return {
    // A load from the database: this is what is stored, nothing is owed.
    // Never call it while busy(): it would drop the change still owed.
    reset(stored) {
      saved = stored;
      latest = stored;
    },
    // The screen's newest state. Starts a save unless one is in flight, in
    // which case this state goes out when that one is done.
    request(next) {
      if (saved === null) {
        // Nothing loaded yet: take it as the starting point, as before.
        saved = next;
        latest = next;
        return;
      }
      if (next === latest) {
        // Nothing new; an owed save still gets another try.
        if (latest !== saved) run();
        return;
      }
      latest = next;
      changes += 1;
      run();
    },
    // A save is in flight or owed. A refresh must not replace the screen's
    // lists while this is true.
    busy() {
      return running || latest !== saved;
    },
    // Counts changes. A refresh reads it before asking the database and
    // again after: if it moved, the answer is older than the screen.
    changes() {
      return changes;
    },
  };
}
