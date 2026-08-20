/**
 * A generic, snapshot-based undo/redo history.
 *
 * Snapshots should be immutable. When snapshots contain mutable values, pass a
 * `clone` function so the history can protect its internal state and callers
 * cannot mutate previously recorded snapshots by reference.
 */

export type SnapshotCloner<TSnapshot> = (snapshot: TSnapshot) => TSnapshot;
export type SnapshotComparator<TSnapshot> = (
  previous: TSnapshot,
  next: TSnapshot,
) => boolean;

export interface CommandHistoryOptions<TSnapshot> {
  /** Maximum number of snapshots available to undo. Defaults to 100. */
  capacity?: number;
  clone?: SnapshotCloner<TSnapshot>;
  /** Returning true prevents a no-op snapshot from being committed. */
  isEqual?: SnapshotComparator<TSnapshot>;
}

export interface CommandHistoryState<TSnapshot> {
  past: readonly TSnapshot[];
  present: TSnapshot;
  future: readonly TSnapshot[];
  capacity: number;
}

const DEFAULT_CAPACITY = 100;

/**
 * Stores immutable snapshots rather than executable commands. It is therefore
 * safe to serialize its state and works with arbitrary editor/store models.
 */
export class CommandHistory<TSnapshot> {
  private readonly cloneSnapshot: SnapshotCloner<TSnapshot>;
  private readonly areEqual: SnapshotComparator<TSnapshot> | undefined;
  private readonly pastSnapshots: TSnapshot[] = [];
  private readonly futureSnapshots: TSnapshot[] = [];
  private presentSnapshot: TSnapshot;

  public readonly capacity: number;

  public constructor(initialSnapshot: TSnapshot, options: CommandHistoryOptions<TSnapshot> = {}) {
    this.capacity = validateCapacity(options.capacity ?? DEFAULT_CAPACITY);
    this.cloneSnapshot = options.clone ?? identity;
    this.areEqual = options.isEqual;
    this.presentSnapshot = this.cloneSnapshot(initialSnapshot);
  }

  public get current(): TSnapshot {
    return this.cloneSnapshot(this.presentSnapshot);
  }

  public get canUndo(): boolean {
    return this.pastSnapshots.length > 0;
  }

  public get canRedo(): boolean {
    return this.futureSnapshots.length > 0;
  }

  public get undoDepth(): number {
    return this.pastSnapshots.length;
  }

  public get redoDepth(): number {
    return this.futureSnapshots.length;
  }

  /**
   * Records a new present snapshot and invalidates the redo branch.
   * Returns false when an equality comparator identifies a no-op update.
   */
  public commit(nextSnapshot: TSnapshot): boolean {
    if (this.areEqual?.(this.presentSnapshot, nextSnapshot) ?? false) {
      return false;
    }

    if (this.capacity > 0) {
      this.pastSnapshots.push(this.cloneSnapshot(this.presentSnapshot));

      if (this.pastSnapshots.length > this.capacity) {
        this.pastSnapshots.splice(0, this.pastSnapshots.length - this.capacity);
      }
    }

    this.presentSnapshot = this.cloneSnapshot(nextSnapshot);
    this.futureSnapshots.length = 0;
    return true;
  }

  /** Moves to the immediately preceding snapshot, if one exists. */
  public undo(): TSnapshot | undefined {
    if (!this.canUndo) {
      return undefined;
    }

    const previousSnapshot = this.pastSnapshots.pop() as TSnapshot;

    this.futureSnapshots.push(this.cloneSnapshot(this.presentSnapshot));
    this.presentSnapshot = previousSnapshot;
    return this.current;
  }

  /** Moves to the immediately following snapshot, if one exists. */
  public redo(): TSnapshot | undefined {
    if (!this.canRedo) {
      return undefined;
    }

    const nextSnapshot = this.futureSnapshots.pop() as TSnapshot;

    if (this.capacity > 0) {
      this.pastSnapshots.push(this.cloneSnapshot(this.presentSnapshot));

      if (this.pastSnapshots.length > this.capacity) {
        this.pastSnapshots.splice(0, this.pastSnapshots.length - this.capacity);
      }
    }

    this.presentSnapshot = nextSnapshot;
    return this.current;
  }

  /** Clears undo and redo stacks while keeping the current snapshot. */
  public clear(): void {
    this.pastSnapshots.length = 0;
    this.futureSnapshots.length = 0;
  }

  /** Replaces all history with a new initial snapshot. */
  public reset(snapshot: TSnapshot): void {
    this.presentSnapshot = this.cloneSnapshot(snapshot);
    this.clear();
  }

  /** Returns a detached, serializable view of the history. */
  public toState(): CommandHistoryState<TSnapshot> {
    return {
      past: this.pastSnapshots.map((snapshot) => this.cloneSnapshot(snapshot)),
      present: this.current,
      future: this.futureSnapshots.map((snapshot) => this.cloneSnapshot(snapshot)),
      capacity: this.capacity,
    };
  }
}

function identity<TSnapshot>(snapshot: TSnapshot): TSnapshot {
  return snapshot;
}

function validateCapacity(capacity: number): number {
  if (!Number.isSafeInteger(capacity) || capacity < 0) {
    throw new RangeError("History capacity must be a non-negative safe integer.");
  }

  return capacity;
}
