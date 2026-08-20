import { describe, expect, it } from "vitest";

import { CommandHistory } from "./CommandHistory";

describe("CommandHistory", () => {
  it("walks snapshots backward and forward", () => {
    const history = new CommandHistory(1);

    history.commit(2);
    history.commit(3);

    expect(history.current).toBe(3);
    expect(history.undo()).toBe(2);
    expect(history.undo()).toBe(1);
    expect(history.undo()).toBeUndefined();
    expect(history.redo()).toBe(2);
    expect(history.redo()).toBe(3);
    expect(history.redo()).toBeUndefined();
  });

  it("invalidates redo history when a new branch is committed", () => {
    const history = new CommandHistory("initial");

    history.commit("first");
    history.commit("second");
    history.undo();
    history.commit("replacement");

    expect(history.current).toBe("replacement");
    expect(history.canRedo).toBe(false);
    expect(history.redo()).toBeUndefined();
  });

  it("enforces its configured undo capacity", () => {
    const history = new CommandHistory(0, { capacity: 2 });

    history.commit(1);
    history.commit(2);
    history.commit(3);

    expect(history.undoDepth).toBe(2);
    expect(history.undo()).toBe(2);
    expect(history.undo()).toBe(1);
    expect(history.undo()).toBeUndefined();
  });

  it("uses a clone function to isolate mutable snapshots", () => {
    const history = new CommandHistory(
      { count: 1 },
      { clone: (snapshot) => ({ ...snapshot }) },
    );

    const exposedSnapshot = history.current;
    exposedSnapshot.count = 99;

    history.commit({ count: 2 });
    expect(history.undo()).toEqual({ count: 1 });

    const state = history.toState();
    expect(state).toMatchObject({
      present: { count: 1 },
      capacity: 100,
    });
  });

  it("skips snapshots identified as equal by its comparator", () => {
    const history = new CommandHistory(
      { count: 1 },
      { isEqual: (previous, next) => previous.count === next.count },
    );

    expect(history.commit({ count: 1 })).toBe(false);
    expect(history.undoDepth).toBe(0);
  });
});
