export default async function handler(req: any, res: any) {
  const key = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION;
  if (!key || !region) {
    return res.status(500).json({ error: "Azure credentials not configured" });
  }
  const response = await fetch(
    `https://${region}.api.cognitive.microsoft.com/sts/v1.0/issueToken`,
    {
      method: "POST",
      headers: { "Ocp-Apim-Subscription-Key": key },
    }
  );
  if (!response.ok) {
    return res.status(502).json({ error: "Failed to fetch Azure token" });
  }
  const token = await response.text();
  res.json({ token, region });
}
