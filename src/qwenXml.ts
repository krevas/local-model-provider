export interface QwenXmlToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface ParsedQwenXmlToolCalls {
  text: string;
  toolCalls: QwenXmlToolCall[];
}

/**
 * Parse Qwen XML-style tool calls that may stream as content or reasoning
 * instead of OpenAI-compatible tool_calls.
 */
export function parseQwenXmlToolCalls(text: string): ParsedQwenXmlToolCalls {
  const toolCalls: QwenXmlToolCall[] = [];
  const withoutToolCalls = text.replace(
    /<tool_call>\s*<function=([^>\s]+)>\s*([\s\S]*?)\s*<\/function>\s*<\/tool_call>/g,
    (_match, name, body) => {
      const args: Record<string, unknown> = {};
      const parameterPattern = /<parameter=([^>\s]+)>\s*([\s\S]*?)\s*<\/parameter>/g;
      let parameterMatch: RegExpExecArray | null;

      while ((parameterMatch = parameterPattern.exec(body)) !== null) {
        const rawValue = parameterMatch[2].trim();
        let value: unknown = rawValue;

        if (/^-?\d+$/.test(rawValue)) {
          value = Number.parseInt(rawValue, 10);
        } else if (/^-?\d+\.\d+$/.test(rawValue)) {
          value = Number.parseFloat(rawValue);
        } else if (rawValue === 'true' || rawValue === 'false') {
          value = rawValue === 'true';
        } else if ((rawValue.startsWith('{') && rawValue.endsWith('}')) || (rawValue.startsWith('[') && rawValue.endsWith(']'))) {
          try {
            value = JSON.parse(rawValue);
          } catch {
            value = rawValue;
          }
        }

        args[parameterMatch[1].trim()] = value;
      }

      toolCalls.push({
        id: `qwen_xml_${Date.now()}_${toolCalls.length}`,
        name: String(name).trim(),
        arguments: JSON.stringify(args),
      });
      return '';
    }
  );

  return { text: withoutToolCalls.trim(), toolCalls };
}
