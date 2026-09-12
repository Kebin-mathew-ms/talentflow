import express from "express";
import axios from "axios";

const router = express.Router();

// The bulletproof URL
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

// 1. --- EXISTING: RUN CODE ROUTE (NOW SUPPORTS CUSTOM INPUT) ---
router.post("/", async (req, res) => {
  try {
    // --- FIXED: Extract 'input' from the frontend request ---
    const { code, language, input } = req.body;

    if (!code) {
      return res.status(400).json({ error: "Code cannot be empty" });
    }

    if (!process.env.GROQ_API_KEY) {
      return res.status(500).json({ error: "Server Configuration Error: API key is missing." });
    }

    // --- FIXED: Updated system prompt to handle Standard Input ---
    const systemPrompt = `You are a strict ${language} compiler and console execution environment. 
    I will provide you with code, and optionally "Standard Input" (simulated keyboard input). You must evaluate the code using that input and reply ONLY with the exact console output it would produce. 
    If the code contains a syntax error or runtime error, reply ONLY with the standard compiler error message. 
    Do NOT include any conversational text, explanations, or markdown formatting like \`\`\`. Just the raw output.`;

    // --- FIXED: Combine the code and the custom input so the AI can read both ---
    let userContent = code;
    if (input && input.trim() !== "") {
        userContent = `Here is the code to execute:\n${code}\n\nHere is the Standard Input (stdin) the user typed:\n${input}`;
    }

    const response = await axios.post(GROQ_URL, {
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent } // Sending the combined prompt!
      ],
      temperature: 0.1, 
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY.trim()}`,
        'Content-Type': 'application/json'
      }
    });

    let output = response.data.choices[0].message.content.trim();

    if (output.startsWith("```")) {
        output = output.replace(/```[a-zA-Z]*\n/g, "").replace(/```/g, "").trim();
    }

    res.status(200).json({ output: output });

  } catch (error) {
    const realError = error?.response?.data?.error?.message || error.message;
    console.error("Groq Compiler API Error:", realError);
    res.status(500).json({ error: `Groq Error: ${realError}` });
  }
});

// 2. --- NEW & IMPROVED: AI LIVE CODE REVIEW ROUTE ---
router.post("/review", async (req, res) => {
  try {
    const { code, language } = req.body;
    
    if (!code) {
      return res.status(400).json({ error: "Code cannot be empty" });
    }

    if (!process.env.GROQ_API_KEY) {
      return res.status(500).json({ error: "Server Configuration Error: API key is missing." });
    }

    const reviewPrompt = `You are an expert Senior Software Engineer evaluating a candidate's ${language} code. 
    Do NOT write a paragraph. Reply using EXACTLY this format with clean line breaks:

    ✅ Logic: [1 short sentence assessing correctness]
    💡 Tip: [1 short, specific improvement]

    Keep it under 50 words total. Do not use markdown backticks or say "Here is the evaluation". Just output the 2 lines.`;

    const response = await axios.post(GROQ_URL, {
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: reviewPrompt }, 
        { role: "user", content: code }
      ],
      temperature: 0.3, 
    }, {
      headers: { 
        'Authorization': `Bearer ${process.env.GROQ_API_KEY.trim()}`, 
        'Content-Type': 'application/json' 
      }
    });

    const review = response.data.choices[0].message.content.trim();
    res.status(200).json({ review });

  } catch (error) {
    const realError = error?.response?.data?.error?.message || error.message;
    console.error("AI Review Error:", realError);
    res.status(500).json({ error: realError });
  }
});

export default router;