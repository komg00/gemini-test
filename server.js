const PORT = 8000;
const express = require("express");
const cors = require("cors");
const fileUpload = require("express-fileupload");
const fs = require("fs");
const app = express();
const {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
} = require("@google/generative-ai");

app.use(cors());
app.use(express.json());
app.use(fileUpload());

const path = require("path");
require("dotenv").config();

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEN_AI_KEY);

function cleanJSONResponse(str) {
  // Remove the ```json ... ``` wrapping
  const cleanedStr = str.replace(/```json/g, "").replace(/```/g, "");
  return cleanedStr.trim();
}

function isJSON(str) {
  try {
    JSON.parse(str);
  } catch (e) {
    return false;
  }
  return true;
}

app.post("/gemini", async (req, res) => {
  console.log(req.body.history);
  console.log(req.body.message);
  const model = genAI.getGenerativeModel({
    model: "gemini-1.5-flash-latest",
    systemInstruction:
      '{\n\t"task" : "role play",\n\t"task_rules": [\n\t\t"The first Response should be \\"Welcome to our fast food store. What can I get for you today? \\"",\n\t\t"Act as the Role",\n\t\t"Wait for user response",\n\t\t"Response are made in less than 100 characters",\n\t],\n\t"role":"a fast-food clerk",\n\t"role_rules":[\n\t\t"The role takses orders from customers",\n\t\t"The role checks if it\'s a set menu or a single item",\n\t\t"The role checks a kind of side menu and drink when the customer decides a set menu"\n\t\t"The role checks the menu if the customer has finished deciding on the menu and present the price",\n\t\t"The role asks the customer if the customer wants to take it out or eat it",\n\t\t"The role asks the customer if the customer wants to pay by credit card or cash"\n\t]\n}',
  });
  const generationConfig = {
    temperature: 1,
    topP: 0.95,
    topK: 64,
    maxOutputTokens: 8192,
    responseMimeType: "text/plain",
  };

  const safetySettings = [
    {
      category: HarmCategory.HARM_CATEGORY_HARASSMENT,
      threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
    },
    {
      category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
      threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
    },
    {
      category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
      threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
    },
    {
      category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
      threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
    },
  ];

  const chat = model.startChat({
    generationConfig,
    safetySettings,
    history: req.body.history,
  });
  const msg = req.body.message;

  const result = await chat.sendMessage(msg);
  const response = await result.response;
  const text = response.text();
  res.json({ text });
});

app.post("/ocr", async (req, res) => {
  if (!req.files || Object.keys(req.files).length === 0) {
    return res.status(400).send("No files were uploaded.");
  }

  const imageFile = req.files.image;
  const imageBuffer = imageFile.data;

  const model = await genAI.getGenerativeModel({ model: "gemini-pro-vision" });
  const prompt =
    "Use OCR to extract English words and their corresponding Korean meanings from the image as text. Return a JSON object where the keys are the English words and the values are the corresponding Korean meanings.";
  const imageParts = [
    {
      inlineData: {
        data: imageBuffer.toString("base64"),
        mimeType: imageFile.mimetype,
      },
    },
  ];

  try {
    const result = await model.generateContent([prompt, ...imageParts]);
    const response = await result.response;
    let text = await response.text();

    text = cleanJSONResponse(text);
    console.log(text);

    if (isJSON(text)) {
      res.json(JSON.parse(text));
    } else {
      res.status(500).send("OCR output is not valid JSON");
    }
  } catch (error) {
    console.error("Error generating content:", error);
    res.status(500).send("Error processing image.");
  }
});

app.listen(PORT, () => console.log(`Listening on port ${PORT}`));
