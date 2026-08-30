declare const process: { env?: Record<string, string | undefined> };

const API_ENDPOINT = "https://api-fanyi.qzhua.net/api/v1/translate";

export async function GET() {
  return Response.json({ error: "仅支持 POST 请求" }, { status: 405 });
}

export async function POST(request: Request) {
  const apiKey = process?.env?.API_KEY;
  if (!apiKey) {
    return Response.json({ error: "服务端未配置 API_KEY" }, { status: 500 });
  }

  try {
    const body = await request.json();
    const response = await fetch(API_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + apiKey,
      },
      body: JSON.stringify(body),
    });

    const responseBody = await response.text();
    return new Response(responseBody, {
      status: response.status,
      headers: {
        "Content-Type": response.headers.get("Content-Type") ?? "application/json",
      },
    });
  } catch (error) {
    console.error("Translation proxy error:", error);
    return Response.json({ error: "翻译服务暂时不可用" }, { status: 502 });
  }
}
