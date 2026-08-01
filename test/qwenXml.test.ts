import assert from 'node:assert/strict';
import { parseQwenXmlToolCalls } from '../src/qwenXml';

const parsed = parseQwenXmlToolCalls(`
<tool_call>
<function=read_file>
<parameter=path>README.md</parameter>
<parameter=max_lines>40</parameter>
<parameter=include_hidden>false</parameter>
</function>
</tool_call>
I'm calling this tool to inspect the project readme.
`);

assert.equal(parsed.toolCalls.length, 1);
assert.equal(parsed.toolCalls[0].name, 'read_file');
assert.deepEqual(JSON.parse(parsed.toolCalls[0].arguments), {
  path: 'README.md',
  max_lines: 40,
  include_hidden: false,
});
assert.equal(parsed.text, "I'm calling this tool to inspect the project readme.");

const parsedMultiple = parseQwenXmlToolCalls(`
<tool_call>
<function=first>
<parameter=enabled>true</parameter>
</function>
</tool_call>
between
<tool_call>
<function=second>
<parameter=payload>{"ok":true}</parameter>
</function>
</tool_call>
after
`);

assert.equal(parsedMultiple.toolCalls.length, 2);
assert.equal(parsedMultiple.text, 'between\n\nafter');
