
import { useState } from 'react';

export default function WebsiteGenerator() {
  const [prompt, setPrompt] = useState('');
  const [output, setOutput] = useState('');

  async function generateCopy() {
    const res = await fetch('/api/generate-copy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt })
    });
    const { copy } = await res.json();
    setOutput(copy);
  }

  return (
    <div>
      <h1>Website Generator</h1>
      <textarea value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="Enter prompt..." />
      <button onClick={generateCopy}>Generate Copy</button>
      <div>{output}</div>
    </div>
  );
}
