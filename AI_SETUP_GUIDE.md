# AI Integration Setup Guide

## Current Status: Mock Mode
The system is currently running in **Mock Mode** (`USE_MOCK_AI=true`). This means:
- ✅ Questions are shuffled but based on pre-defined templates
- ✅ Evaluations are now dynamic based on answer characteristics (length, code examples, trade-offs mentioned)
- ❌ NOT using real AI for generating questions or evaluations
- ❌ Cannot provide truly personalized feedback

## Switch to Real AI (Recommended for Production)

### Option 1: Using OpenAI (ChatGPT)
1. Get an API key from [OpenAI](https://platform.openai.com/api-keys)
2. Update `server/.env`:
   ```
   USE_MOCK_AI=false
   OPENAI_API_KEY=sk-your-key-here
   ```
3. Restart the server

### Option 2: Using Google Gemini (Free Tier Available)
1. Get an API key from [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Update `server/.env`:
   ```
   USE_MOCK_AI=false
   GEMINI_API_KEY=your-key-here
   GEMINI_MODEL=gemini-2.0-flash
   ```
3. Restart the server

## Current Mock Mode Behavior

### Dynamic Mock Evaluation
The system now evaluates answers based on:
- **Answer length**: Longer answers get higher clarity scores
- **Code examples**: Detects backticks or "code"/"example" keywords
- **Trade-offs**: Detects discussion of alternatives or trade-offs
- **Feedback**: Tailored based on what's detected in the answer

### Dynamic Questions
- Questions are shuffled on each session (different order each time)
- Each session gets a unique timestamp-based ID for tracking

## What Will Improve With Real AI

✨ **With Real AI you'll get:**
- Truly unique questions tailored to user's skills and job requirements
- Intelligent evaluation that understands semantic meaning
- Context-aware feedback specific to the user's actual answer
- Better overall interview experience

## Testing the Mock Mode
The mock mode is perfect for development and testing without API costs. 
Just remember: **the evaluations are pattern-based, not intelligent**.
