import { describe, test, vi, expect, beforeAll } from "vitest";
import { initTRPC } from "@trpc/server"
import { compileComputation } from "../../server/blockSerialization";
import { appRouter } from "../../server/router";

vi.mock("../../server/blockSerialization", () => ({
  compileComputation: vi.fn(),
}));

describe("router", () => {
  let caller;

  beforeAll(() => {
    const t = initTRPC.create();
    const createCaller = t.createCallerFactory(appRouter);
    caller = createCaller()
  })
  
  
  describe("compileComputation", () => {
    test("returns compilation object", async () => {
      const expectedSpecs = {
        description:
          "A textual description of the compute function.:in1 (all): Textual description of in1in2 (all): Textual description of in2:out1 (all): Textual description of out1out2 (all): Textual description of out2:",
        inputs: {
          in1: { type: "Any", connections: [], relays: [] },
          in2: { type: "Any", connections: [], relays: [] },
        },
        outputs: {
          out1: { type: "Any", connections: [], relays: [] },
          out2: { type: "Any", connections: [], relays: [] },
        },
      };

      compileComputation.mockResolvedValueOnce(expectedSpecs);

      const result = await caller.compileComputation({blockPath: ""});

      expect(result).toEqual(expectedSpecs);
    });

    test("throws BAD_REQUEST on failure", async () => {
      compileComputation.mockRejectedValueOnce(new Error("failure"));

      expect(caller.compileComputation({blockPath: ""})).rejects.toThrowError("Could not compile.");
    });
  });
});
