// Appendix C, example 2 (paper p. 18): addVersion, total 35. Ported from Java.
// Java's two catch clauses on one try become two nested try statements, because
// JavaScript allows one catch per try; `synchronized (this)` becomes a plain block.
declare const TIMED_OUT: number;
declare const ABORTED: number;
declare const DEFAULT_MAX_WAIT_TIME: number;

interface Entry {
  getVersion(): number;
  getPrevious(): Entry | null;
  setPrevious(previous: Entry | null): void;
}

interface Transaction {
  isActive(): boolean;
  getTransactionStatus(): number;
}

interface TransactionIndex {
  wwDependency(version: number, status: number, maxWait: number): number;
}

class WWRetryException extends Error {
  constructor(public readonly versionHandle: number) {
    super();
  }
}

class RollbackException extends Error {}

class InterruptedException extends Error {}

class PersistitInterruptedException extends Error {
  constructor(cause: Error) {
    super(cause.message);
  }
}

export class TimelyResource {
  private frst: Entry | null = null;

  constructor(private readonly persistit: { getTransactionIndex(): TransactionIndex }) {}

  addVersion(entry: Entry, txn: Transaction): void {
    const ti = this.persistit.getTransactionIndex();
    while (true) {                                                          // +1
      try {
        try {
          {
            if (this.frst !== null) {                                       // +2 (nesting = 1)
              if (this.frst.getVersion() > entry.getVersion()) {            // +3 (nesting = 2)
                throw new RollbackException();
              }
              if (txn.isActive()) {                                         // +3 (nesting = 2)
                for (let e: Entry | null = this.frst; e !== null; e = e.getPrevious()) { // +4 (nesting = 3)
                  const version = e.getVersion();
                  const depends = ti.wwDependency(version, txn.getTransactionStatus(), 0);
                  if (depends === TIMED_OUT) {                              // +5 (nesting = 4)
                    throw new WWRetryException(version);
                  }
                  if (depends !== 0 && depends !== ABORTED) {               // +5 (nesting = 4), +1 for &&
                    throw new RollbackException();
                  }
                }
              }
            }
            entry.setPrevious(this.frst);
            this.frst = entry;
            break;
          }
        } catch (re) {                                                      // +2 (nesting = 1)
          try {
            const depends = this.persistit
              .getTransactionIndex()
              .wwDependency((re as WWRetryException).versionHandle, txn.getTransactionStatus(), DEFAULT_MAX_WAIT_TIME);
            if (depends !== 0 && depends !== ABORTED) {                     // +3 (nesting = 2), +1 for &&
              throw new RollbackException();
            }
          } catch (ie) {                                                    // +3 (nesting = 2)
            throw new PersistitInterruptedException(ie as InterruptedException);
          }
        }
      } catch (ie) {                                                        // +2 (nesting = 1)
        throw new PersistitInterruptedException(ie as InterruptedException);
      }
    }
  }                                                                         // total complexity = 35
}
