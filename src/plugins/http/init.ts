import fs from "fs";

import follow_redirects from "follow-redirects";
const { https } = follow_redirects;
import { convert } from "html-to-text";

import { Talos, Dict } from "../../core/talos.js";
import { JinaSearch } from "./jina.js";
import { ExaSearch } from "./exa.js";
import { TavilySearch } from "./tavily.js";
import { PluginBase } from "../plugin-base.js";

export default class Http extends PluginBase {
  readonly headers = {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
    Connection: "keep-alive",
    "Upgrade-Insecure-Requests": "1",
  };

  jina!: JinaSearch;
  exa!: ExaSearch;
  tavily!: TavilySearch;
  boundAgentPrivateEventHandler!: (name: string, args: Dict<any>) => void;

  async load(agent: Talos) {
    agent.registerNetwork("http", {
      name: "HTTP",
      endpoints: [
        this.config.jina?.base_url,
        this.config.exa?.base_url,
        this.config.tavily?.base_url,
        "user-provided URLs",
      ].filter(Boolean),
      sendsUserData: true,
    });
    if (this.config.jina) {
      this.jina = new JinaSearch({
        baseUrl: this.config.jina.base_url,
        apiKey: this.config.jina.api_key,
      });
    }
    if (this.config.exa) {
      this.exa = new ExaSearch({
        baseUrl: this.config.exa.base_url,
        apiKey: this.config.exa.api_key,
      });
    }
    if (this.config.tavily) {
      this.tavily = new TavilySearch({
        baseUrl: this.config.tavily.base_url,
        apiKey: this.config.tavily.api_key,
      });
    }
    this.boundAgentPrivateEventHandler =
      this.agentPrivateEventHandler.bind(this);
    agent.on("private-event", this.boundAgentPrivateEventHandler);
    agent.emitPrivateEvent("webapp-ui/request-token", {});

    agent.registerTool(
      {
        name: "http/fetch",
        desc: "Fetches an HTTP/HTTPS URL.",
        risk: "network",
        privacy: { sendsNetwork: true, mayExposeUserData: true },
        args: {
          url: {
            type: "string",
            desc: "The URL to fetch.",
            required: true,
          },
          method: {
            type: "string",
            desc: "The HTTP method to use. Defaults to GET.",
            required: false,
          },
          headers: {
            type: "object",
            desc: "The headers to send with the request.",
            required: false,
          },
          body: {
            type: "string",
            desc: "The body to send with the request.",
            required: false,
          },
        },
        retvals: {
          result: {
            type: "string",
            desc: "The result of the fetch.",
            required: true,
          },
        },
      },
      {
        fn: async (args: Dict<any>) => {
          const response = await fetch(args.url, {
            method: args.method,
            headers: args.headers
              ? {
                  ...this.headers,
                  ...args.headers,
                }
              : this.headers,
            body: args.body,
            redirect: "follow",
          });
          return { result: convert(await response.text()) };
        },
        explain_args: (args: Dict<any>) => ({
          summary: `Fetching the URL ${args.url}...`,
        }),
        explain_retvals: (args: Dict<any>, retvals: Dict<any>) => ({
          summary: `The URL ${args.url} was fetched successfully.`,
          details: retvals.result,
        }),
      },
    );
    if (this.config.jina) {
      agent.registerTool(
        {
          name: "http/search",
          desc: "Searches the web for information.",
          risk: "network",
          privacy: { sendsNetwork: true, mayExposeUserData: true },
          args: {
            query: {
              type: "string",
              desc: "The query to search for.",
              required: true,
            },
          },
          retvals: {
            results: {
              type: "array",
              desc: "The results of the search.",
              required: true,
              of: {
                type: "object",
                desc: "The result of the search.",
                of: {
                  title: {
                    type: "string",
                    desc: "The title of the result.",
                    required: true,
                  },
                  url: {
                    type: "string",
                    desc: "The URL of the result.",
                    required: true,
                  },
                  desc: {
                    type: "string",
                    desc: "The description of the result.",
                    required: true,
                  },
                },
                required: true,
              },
            },
          },
        },
        {
          fn: async (args: Dict<any>) => {
            const results = await this.jina.search(args.query);
            return { results };
          },
          explain_args: (args: Dict<any>) => ({
            summary: `Searching the web for ${args.query}...`,
          }),
          explain_retvals: (args: Dict<any>, retvals: Dict<any>) => ({
            summary: `Found ${retvals.results.length} results for ${args.query}.`,
            details: JSON.stringify(retvals.results),
          }),
        },
      );
    }
    if (this.config.exa) {
      agent.registerTool(
        {
          name: "http/exa-search",
          desc: "Searches the web for information using Exa API.",
          risk: "network",
          privacy: { sendsNetwork: true, mayExposeUserData: true },
          args: {
            query: {
              type: "string",
              desc: "The query to search for.",
              required: true,
            },
          },
          retvals: {
            results: {
              type: "array",
              desc: "The results of the search.",
              required: true,
              of: {
                type: "object",
                desc: "A single search result.",
                of: {
                  title: {
                    type: "string",
                    desc: "The title of the result.",
                    required: true,
                  },
                  url: {
                    type: "string",
                    desc: "The URL of the result.",
                    required: true,
                  },
                  text: {
                    type: "string",
                    desc: "Text content snippet.",
                    required: true,
                  },
                },
                required: true,
              },
            },
          },
        },
        {
          fn: async (args: Dict<any>) => {
            const results = await this.exa.search(args.query);
            return { results };
          },
          explain_args: (args: Dict<any>) => ({
            summary: `Searching the web with Exa for ${args.query}...`,
          }),
          explain_retvals: (args: Dict<any>, retvals: Dict<any>) => ({
            summary: `Found ${retvals.results.length} results with Exa for ${args.query}.`,
            details: JSON.stringify(retvals.results),
          }),
        },
      );
    }
    if (this.config.tavily) {
      agent.registerTool(
        {
          name: "http/tavily-search",
          desc: "Searches the web for information using Tavily API.",
          risk: "network",
          privacy: { sendsNetwork: true, mayExposeUserData: true },
          args: {
            query: {
              type: "string",
              desc: "The query to search for.",
              required: true,
            },
          },
          retvals: {
            results: {
              type: "array",
              desc: "The results of the search.",
              required: true,
              of: {
                type: "object",
                desc: "A single search result.",
                of: {
                  title: {
                    type: "string",
                    desc: "The title of the result.",
                    required: true,
                  },
                  url: {
                    type: "string",
                    desc: "The URL of the result.",
                    required: true,
                  },
                  content: {
                    type: "string",
                    desc: "Text content snippet.",
                    required: true,
                  },
                },
                required: true,
              },
            },
          },
        },
        {
          fn: async (args: Dict<any>) => {
            const results = await this.tavily.search(args.query);
            return { results };
          },
          explain_args: (args: Dict<any>) => ({
            summary: `Searching the web with Tavily for ${args.query}...`,
          }),
          explain_retvals: (args: Dict<any>, retvals: Dict<any>) => ({
            summary: `Found ${retvals.results.length} results with Tavily for ${args.query}.`,
            details: JSON.stringify(retvals.results),
          }),
        },
      );
    }
    agent.registerTool(
      {
        name: "http/download-file",
        desc: "Downloads a file from an HTTP/HTTPS URL.",
        risk: "write",
        privacy: { sendsNetwork: true, touchesFiles: true },
        args: {
          url: {
            type: "string",
            desc: "The URL to download the file from.",
            required: true,
          },
          filename: {
            type: "string",
            desc: "The filename to save the file as.",
            required: true,
          },
        },
        retvals: {
          result: {
            type: "string",
            desc: "The result of the download.",
            required: true,
          },
        },
      },
      {
        fn: (args: Dict<any>) => {
          return new Promise((resolve, reject) => {
            const file = fs.createWriteStream(args.filename);

            const request = https.get(args.url, {
              headers: this.headers,
            });

            request.on("error", reject);

            request.on("response", (response) => {
              if (response.statusCode !== 200) {
                reject(
                  new Error(`Failed to download file: ${response.statusCode}`),
                );
                return;
              }

              response.pipe(file);

              file.on("finish", () => {
                file.close();
                resolve({ result: "success" });
              });

              file.on("error", (err) => {
                fs.unlink(args.filename, () => reject(err));
              });
            });
          });
        },
        explain_args: (args: Dict<any>) => ({
          summary: `Downloading the file from ${args.url} to ${args.filename}...`,
        }),
        explain_retvals: (args: Dict<any>, retvals: Dict<any>) => ({
          summary: `The file ${args.filename} was downloaded successfully.`,
        }),
      },
    );
  }

  async unload(agent: Talos) {
    agent.off("private-event", this.boundAgentPrivateEventHandler);
    agent.deregisterTool("http/fetch");
    if (this.config.jina) {
      agent.deregisterTool("http/search");
    }
    if (this.config.exa) {
      agent.deregisterTool("http/exa-search");
    }
    if (this.config.tavily) {
      agent.deregisterTool("http/tavily-search");
    }
    agent.deregisterTool("http/download-file");
  }

  agentPrivateEventHandler(name: string, args: Dict<any>) {
    if (name === "webapp-ui/token-refreshed") {
      if (this.config.jina) {
        this.jina = new JinaSearch({
          baseUrl: this.config.jina.base_url,
          apiKey: args.token,
        });
      }
      if (this.config.exa) {
        this.exa = new ExaSearch({
          baseUrl: this.config.exa.base_url,
          apiKey: this.config.exa.api_key || args.token,
        });
      }
      if (this.config.tavily) {
        this.tavily = new TavilySearch({
          baseUrl: this.config.tavily.base_url,
          apiKey: args.token,
        });
      }
    }
  }
}
