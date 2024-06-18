export async function updateSpecs(blockFolderName, newSpecsIO, pipelineSpecs, editor) {
  const newSpecs = updateSpecsIO(pipelineSpecs[blockFolderName], newSpecsIO)
  removeDanglingConnections(pipelineSpecs, blockFolderName, newSpecs, editor);
  return newSpecs
}

function updateSpecsIO(specs, IO) {
  const newSpecs = structuredClone(specs)
  newSpecs.information.description = IO.description

  const newInputs = mergeIO(newSpecs.inputs, IO.inputs)
  newSpecs.inputs = newInputs

  const newOutputs = mergeIO(newSpecs.outputs, IO.outputs)
  newSpecs.outputs = newOutputs 
  
  return newSpecs
}

function mergeIO(oldIO, IO) {
  const mergedIO = {}
  for (const key in IO) {
    if (key in oldIO) {
      mergedIO[key] = oldIO[key]
      mergedIO[key].type = IO[key].type 
    } else {
      mergedIO[key] = IO[key]
    }
  }
  return mergedIO
}

function removeDanglingConnections (pipeline, blockFolderName, content, editor) {
  getRemovedIOKeys(pipeline[blockFolderName].outputs, content.outputs)
    .forEach((key) => {editor.removeNodeOutputConnections(blockFolderName, key)});

  getRemovedIOKeys(pipeline[blockFolderName].inputs, content.inputs)
    .forEach((key) => {editor.removeNodeInputConnections(blockFolderName, key)});
}

function getRemovedIOKeys(oldIO, newIO) {
  const oldKeys = Object.keys(oldIO);
  const newKeys = Object.keys(newIO);
  const removedKeys = oldKeys.filter(x => !newKeys.includes(x));
  return removedKeys;
}
