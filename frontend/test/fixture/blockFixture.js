export function getId() {
  return "new-python-123"
}

export function getSpecs() {
  return {
    information: {
      id: "new-python",
      name: "New Python",
      description: "Template block for custom computations.",
      system_versions: ["0.1"],
      block_version: "block version number",
      block_source: "core/blocks/new-python",
      block_type: "compute",
    },
    inputs: {
      in1: {
        type: "int",
        connections: [],
        relays: [],
      },
      in2: {
        type: "str",
        connections: [],
        relays: [],
      },
    },
    outputs: {
      out1: {
        type: "int",
        connections: [],
        relays: [],
      },
      out2: {
        type: "str",
        connections: [],
        relays: [],
      },
    },
    action: {
      container: {
        image: "new-python",
        version: "latest",
        command_line: ["python", "entrypoint.py"],
      },
    },
    views: {
      node: {
        behavior: "modal",
        active: "True or False",
        title_bar: {},
        preview: {},
        html: "",
        pos_x: "300",
        pos_y: "200",
        pos_z: "999",
      },
    },
    events: {},
  };
}

export function getCompuationsSourceCode() { return `def compute(in1, in2):
    """A textual description of the compute function.

    Inputs:
        in1 (all): Textual description of in1
        in2 (all): Textual description of in2

    Outputs:
        out1 (all): Textual description of out1
        out2 (all): Textual description of out2

    Requirements:
    """
    # some code
    out1 = 2 * in1
    out2 = "This is the in2 string:" + in2

    return {"out1": out1, "out2": out2}`;
}

export function getCompilationIO() {
  return {
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
}

