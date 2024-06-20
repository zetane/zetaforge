export async function getBuildContextStatus(configuration, pipelineSpecs) {
  const response = await handleRequest(
    buildPath(
      DEFAULT_SCHEME,
      configuration.host,
      configuration.anvilPort,
      "build-context-status",
    ),
    HttpMethod.POST,
    {},
    pipelineSpecs,
  );

  const body = await response.json();

  return body;
}

export async function createExecution(
  configuration,
  executionId,
  pipelineSpecs,
  rebuild,
) {
  const sortedPipelines = buildSortKeys(pipelineSpecs);
  const response = await handleRequest(
    buildPath(
      DEFAULT_SCHEME,
      configuration.host,
      configuration.anvilPort,
      "execute",
    ),
    HttpMethod.POST,
    {},
    {
      id: executionId,
      pipeline: sortedPipelines,
      build: rebuild,
    },
  );

  const body = await response.json();

  return body;
}

const DEFAULT_SCHEME = "http";

const HttpMethod = {
  GET: "GET",
  POST: "POST",
};

function buildPath(scheme, host, port, path) {
  const base = `${scheme}://${host}:${port}`;
  const url = new URL(path, base);
  return url;
}

async function handleRequest(url, method, headers, body = null) {
  try {
    const response = await fetch(url, {
      method: method,
      headers: headers,
      body: body ? JSON.stringify(body) : null,
    });
    return response;
  } catch (error) {
    const message = `Anvil request failed: ${error}`;
    console.trace(message);
    throw new Error(message);
  }
}

const buildSortKeys = (specs) => {
  for (const blockId in specs.pipeline) {
    const orderObject = {
      input: [],
      output: [],
    };

    const block = specs.pipeline[blockId];
    const inputKeys = Object.keys(block.inputs);
    const outputKeys = Object.keys(block.outputs);

    orderObject.input = (inputKeys);
    orderObject.output = (outputKeys);

    block.views.node.order = orderObject
  }

  return specs
}
