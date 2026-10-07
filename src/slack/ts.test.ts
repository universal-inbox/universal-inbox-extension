import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { compareSlackTs, latestSlackTs, shouldMarkAsRead } from "./ts.ts";

describe("compareSlackTs", () => {
  it("returns 0 for equal timestamps", () => {
    assert.equal(compareSlackTs("1712345678.000200", "1712345678.000200"), 0);
  });

  it("orders by seconds first", () => {
    assert.ok(compareSlackTs("1712345677.999999", "1712345678.000000") < 0);
    assert.ok(compareSlackTs("1712345679.000000", "1712345678.999999") > 0);
  });

  it("orders by micros when seconds are equal", () => {
    assert.ok(compareSlackTs("1712345678.000199", "1712345678.000200") < 0);
    assert.ok(compareSlackTs("1712345678.000201", "1712345678.000200") > 0);
  });

  it("treats micros of different lengths as fractions", () => {
    assert.equal(compareSlackTs("1712345678.5", "1712345678.500000"), 0);
    assert.ok(compareSlackTs("1712345678.1", "1712345678.099999") > 0);
    assert.equal(compareSlackTs("1712345678", "1712345678.000000"), 0);
  });

  it("does not lose precision like a float comparison would", () => {
    assert.ok(compareSlackTs("1712345678.000001", "1712345678.000002") < 0);
  });
});

describe("shouldMarkAsRead", () => {
  it("marks when the action ts is newer than Slack's last_read", () => {
    assert.equal(
      shouldMarkAsRead("1712345678.000300", "1712345678.000200"),
      true
    );
  });

  it("skips when Slack's last_read equals the action ts", () => {
    assert.equal(
      shouldMarkAsRead("1712345678.000200", "1712345678.000200"),
      false
    );
  });

  it("skips when Slack's last_read is already past the action ts", () => {
    assert.equal(
      shouldMarkAsRead("1712345678.000200", "1712345999.000100"),
      false
    );
  });

  it("marks when Slack has no read marker", () => {
    assert.equal(shouldMarkAsRead("1712345678.000200", undefined), true);
    assert.equal(shouldMarkAsRead("1712345678.000200", ""), true);
    assert.equal(shouldMarkAsRead("1712345678.000200", "0"), true);
    assert.equal(
      shouldMarkAsRead("1712345678.000200", "0000000000.000000"),
      true
    );
  });
});

describe("latestSlackTs", () => {
  it("keeps Slack's last_read when it is newer", () => {
    assert.equal(
      latestSlackTs("1712345678.000200", "1712345999.000100"),
      "1712345999.000100"
    );
  });

  it("uses the action ts when it is newer or no marker exists", () => {
    assert.equal(
      latestSlackTs("1712345678.000300", "1712345678.000200"),
      "1712345678.000300"
    );
    assert.equal(
      latestSlackTs("1712345678.000300", undefined),
      "1712345678.000300"
    );
  });
});
