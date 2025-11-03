import {MCPProxy} from "@nullplatform/meta-mcp-proxy"
import Swagger from "swagger-client";
import {NPToken} from "./np_token.js";
/**
 * Example about how to create an open api mcp that enables the llm to discover the endpoints
 */
export class NullplatformApiMcp  {
    constructor({openApiUrl="https://docs.nullplatform.com/openapi.json", npToken}) {
        this.mcpProxy = new MCPProxy({
            discoverDescriptionExtras: "Enable get, create and modify deployments, scopes, services, applications and other nullplatform objects. \n" +
                "When nrn is required first get the entity and then use the entity nrn \n" +
                "Before execute any create operation ask to the user \n" +
                "For any entity that the user ask first try to get the entity and then look for other operations \n"+
                "Include parameters or requestBody if they have content if not ommit the keys \n"
        })
        this.npToken = npToken;
        this.openApiUrl = openApiUrl;
    }

    #parseParams(operation) {
        const parsedParams = {type: 'object', properties: {
            parameters: {type: 'object', properties: {}},
            requestBody: {type: 'object', properties: {}}
        }};
        const params = operation.parameters || [];
        for (const param of params) {
            parsedParams.properties.parameters.properties[param.name] = {

                description: param.description || 'No description',
                ...param.schema
            };
        }

        if(operation.requestBody) {
            const requestBody = operation.requestBody;
            if(requestBody.content) {
                const content = Object.values(requestBody.content)[0];
                parsedParams.properties.requestBody.properties = {
                    description: requestBody.description || 'No description',
                    ...content.schema
                };
            }
        }

        return Object.keys(parsedParams).length === 0? null : parsedParams;
    }

    async init() {
        const response = await fetch(this.openApiUrl);
        const specJson = await response.json();
        const client = await Swagger({spec: specJson});
        const spec = client.spec;
        for (const [path, methods] of Object.entries(spec.paths)) {
            for (const [method, operation] of Object.entries(methods)) {
                if(!operation || !operation.operationId) {
                    continue;
                }
                const tag = (operation.tags && operation.tags[0]) || 'default';
                let operationId = operation.operationId;
                operation.parameters?.forEach((parameter) => {
                    if (parameter.in === 'path') {
                        operationId = `${operationId}_by_${parameter.name}`;
                    }
                })

                const parametersParsed = this.#parseParams(operation);
                this.mcpProxy.registerJsFunction({
                    name: operationId,
                    description: operation.description || 'No description',
                    inputSchema: parametersParsed,
                    fn: async (args) => {
                        try {
                            const token = await this.npToken.getToken();

                            const executeArgs = {
                                operationId: operation.operationId,
                                parameters: args.parameters || {},
                                securities: {
                                    authorized: {
                                        bearerAuth: token
                                    }
                                }
                            };

                            if (args.requestBody) {
                                executeArgs.requestBody = args.requestBody;
                            }

                            const response = await client.execute(executeArgs);

                            return {content: [
                                    {
                                        type: "text",
                                        text: JSON.stringify(response.body)
                                    }
                                ]}
                        } catch (err) {
                            console.error(`Error calling ${operationId}:`, err);
                            throw err;
                        }
                    }
                })
            }
        }
        await this.mcpProxy.startMCP();
    }


}


