export interface IJinaSearchInitParams {
  baseUrl?: string;
  apiKey: string;
}

export interface IJinaSearchResult {
  title: string;
  url: string;
  desc: string;
}

export class JinaSearch {
  baseUrl: string;
  apiKey: string;

  constructor(initParams: IJinaSearchInitParams) {
    this.baseUrl = initParams.baseUrl || "https://s.jina.ai";
    this.apiKey = initParams.apiKey;
  }

  async search(query: string): Promise<IJinaSearchResult[]> {
    const response = await fetch(`${this.baseUrl}/`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${this.apiKey}`,
        "X-Respond-With": "no-content",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ q: query, num: 20 }),
    });
    if (!response.ok) {
      throw new Error("Failed to search");
    }

    const json = await response.json();
    return json.data.map((result: any) => ({
      title: result.title,
      url: result.url,
      desc: result.description,
    }));
  }
}
