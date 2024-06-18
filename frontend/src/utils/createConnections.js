// When we load pipelines, we must draw the connection

export const createConnections = (pipeline) => {
    const connectionList = {}
    for (const [output_id, block] of Object.entries(pipeline)) {
        let outputNames = block.outputs
        for (const [output_class, output] of Object.entries(outputNames)) {
            let inputConnections = output.connections;
            for (const input of inputConnections) {
                const input_id = input.block;
                const input_class = input.variable;
                const svgName = '.connection.node_in_node-' + input_id + '.node_out_node-' + output_id + '.' + output_class + '.' + input_class;
                if (!connectionList[svgName]) {
                    connectionList[svgName] = {
                        input_id,
                        input_class,
                        output_id,
                        output_class,
                    }
                }

            }
        }
    }
    return connectionList;
}