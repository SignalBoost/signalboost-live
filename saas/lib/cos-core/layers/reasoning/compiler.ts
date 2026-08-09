import {
  assertCanonicalTool,
  type CanonicalToolDescription,
  type JsonSchema,
} from './types'

function normalizedParameters(parameters: JsonSchema): JsonSchema {
  return {
    ...parameters,
    type: parameters.type ?? 'object',
    properties: parameters.properties ?? {},
    required: parameters.required ?? [],
    additionalProperties: parameters.additionalProperties ?? false,
  }
}

export class ToolCompiler {
  static toOpenAI(tools: CanonicalToolDescription[]) {
    return tools.map((tool) => {
      assertCanonicalTool(tool)
      return {
        type: 'function' as const,
        function: {
          name: tool.name,
          description: tool.description,
          parameters: normalizedParameters(tool.parameters),
        },
      }
    })
  }

  static toAnthropic(tools: CanonicalToolDescription[]) {
    return tools.map((tool, index) => {
      assertCanonicalTool(tool)
      const definition: Record<string, unknown> = {
        name: tool.name,
        description: tool.description,
        input_schema: normalizedParameters(tool.parameters),
      }

      // Anthropic can cache the stable system/tool prefix. Mark only the final
      // definition so the full preceding tool library is covered by one break.
      if (index === tools.length - 1) {
        definition.cache_control = { type: 'ephemeral' }
      }

      return definition
    })
  }
}
