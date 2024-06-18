import * as blockFixture from "./blockFixture";

export function getId() {
  return "pipeline-a1b2c3";
}

export function getSpecs() {
  return {
    pipeline: {
      [blockFixture.getId()]: blockFixture.getSpecs(),
    },
    sink: "",
    build: "",
    name: "Automated test pipeline",
    id: getId(),
  };
}
