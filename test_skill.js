
const fetch = require('node-fetch');

async function testLearning() {
  const skill = {
    use_when: "Testing skill storage",
    tool_sops: [{ tool_name: "test", action: "echo 'it works'" }],
    preferences: "None"
  };

  try {
    const res = await fetch('http://localhost:3003/api/knowledge/skills', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ skill })
    });
    
    if (res.status === 429) {
      console.log("Rate limited!");
      return;
    }

    const data = await res.json();
    console.log("Response:", data);
  } catch (e) {
    console.error("Error:", e);
  }
}

testLearning();
