# FixFlow AI - AWS Lambda Python Backend (RAG Pipeline)

This directory contains the Python AWS Lambda function and LangChain RAG pipeline for FixFlow AI.

## Architecture

```
[User Complaint + Image]
         │
         ▼
[AWS API Gateway] ──POST──► [AWS Lambda (lambda_function.py)]
                                  │
      ┌───────────────────────────┴───────────────────────────┐
      │                                                       │
      ▼                                                       ▼
[Pinecone Vector Store]                               [Google Gemini 1.5 Flash]
  - Query past matching tickets                          - Multimodal vision analysis
  - Retrieve resolution logs & fixes                     - Historical context injection
      │                                                  - Recurring issue detection
      │                                                  - Auto-escalate urgency
      └───────────────────────────┬───────────────────────────┘
                                  │
                                  ▼
                     [Structured Ticket Output]
                                  │
              ┌───────────────────┴───────────────────┐
              ▼                                       ▼
     [Save to Airtable]                       [Upsert to Pinecone]
```

## Environment Variables

Configure these in the AWS Lambda Console under **Configuration -> Environment variables**:

| Variable | Description | Default |
| :--- | :--- | :--- |
| `GEMINI_API_KEY` | Google AI Studio API key | *(Required)* |
| `PINECONE_API_KEY` | Pinecone vector database API key | *(Required)* |
| `PINECONE_INDEX_NAME` | Pinecone index name | `fixflow-maintenance-tickets` |
| `PINECONE_CLOUD` | Cloud provider | `aws` |
| `PINECONE_REGION` | Cloud region | `us-east-1` |
| `AIRTABLE_API_KEY` | Airtable Personal Access Token (PAT) | *(Optional)* |
| `AIRTABLE_BASE_ID` | Airtable Base ID | `app32PCGpVp4lBamC` |
| `AIRTABLE_TABLE_NAME` | Airtable Table ID or Name | `tblyhV3Zxyw2wWzww` |

## Deployment Options

### Option 1: AWS Serverless Application Model (SAM) / Zip
1. Install dependencies:
   ```bash
   pip install -r requirements.txt -t package/
   cp lambda_function.py package/
   cd package && zip -r ../fixflow_lambda.zip . && cd ..
   ```
2. Upload `fixflow_lambda.zip` to AWS Lambda with runtime **Python 3.11**.
3. Set handler to: `lambda_function.lambda_handler`.
4. Attach an **API Gateway HTTP/REST API** with a `POST /analyze-ticket` route and enable CORS.
5. Copy the generated API Gateway URL (e.g. `https://xyz.execute-api.us-east-1.amazonaws.com/analyze-ticket`) into the FixFlow AI Frontend.
