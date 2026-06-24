import { Talos, Dict } from "../../core/talos.js";
import { PluginBase } from "../plugin-base.js";
import { makeId } from "../../core/privacy.js";
import { load } from "sqlite-vec";
import { DatabaseSync } from "node:sqlite";
import OpenAI from "openai";
import { openaiDefaultHeaders } from "../../utils/constants.js";
interface ILongTermMemoryItem {
  desc: string;
  data: Dict<any>;
  created_at: string;
}

export default class LongTermMemory extends PluginBase {
  store: Dict<ILongTermMemoryItem> = {};
  openai!: OpenAI;
  db!: DatabaseSync;
  desc() {
    return "You have a long-term memory. You must put whatever you think a human would remember long-term in here. This could be knowledge, experiences, or anything else you think is important. It's a key-value store. The key is a string, and the value is a JSON object. You will override the value if you store the same key again. If you want to recall something, you should list and/or retrieve it.";
  }

  async load(agent: Talos) {
    agent.registerNetwork("long-term-memory", {
      name: "Long-term memory embeddings",
      endpoints: [this.config.base_url],
      sendsUserData: true,
    });
    this.db = new DatabaseSync(
      this.config.persist_db ? this.config.db_file : ":memory:",
      {
        allowExtension: true,
      },
    );
    load(this.db);

    // TODO: Support migration for varying dimensions
    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS vec_items USING 
      vec0(
        embedding float[${this.config.dimensions}],
        id text,
        desc text,
        data text
      )
    `);

    const insertStmt = this.db.prepare(
      "INSERT INTO vec_items(embedding, id, desc, data) VALUES (?, ?, ?, ?)",
    );

    this.openai = new OpenAI({
      baseURL: this.config.base_url,
      apiKey: this.config.api_key,
      defaultHeaders: openaiDefaultHeaders,
    });

    agent.registerTool(
      {
        name: "ltm/store",
        desc: "Store some data to your long-term memory.",
        risk: "write",
        privacy: { mayExposeUserData: true },
        args: {
          desc: {
            type: "string",
            desc: "A description of the data.",
            required: true,
          },
          data: {
            type: "object",
            desc: "The data to store.",
            required: true,
          },
        },
        retvals: {
          id: {
            type: "string",
            desc: "The stable memory ID.",
            required: true,
          },
          status: {
            type: "string",
            desc: "The status of the operation.",
            required: true,
          },
        },
      },
      {
        fn: async (args: Dict<any>) => {
          const id = makeId("mem");
          const embedding = await this.openai.embeddings.create({
            model: this.config.vector_model,
            dimensions: this.config.dimensions,
            input: args.desc,
            encoding_format: "float",
          });
          agent.recordModelCall(
            this.config.vector_model,
            this.config.base_url,
            "ltm/store created an embedding.",
          );
          insertStmt.run(
            Float32Array.from(embedding.data[0].embedding),
            id,
            args.desc,
            JSON.stringify(args.data),
          );
          return { id, status: "success" };
        },
      },
    );
    agent.registerTool(
      {
        name: "ltm/list",
        desc: "List your long-term memory.",
        risk: "read",
        args: {},
        retvals: {
          list: {
            type: "array",
            desc: "The list of metadata of the long-term memory.",
            required: true,
            of: {
              type: "object",
              desc: "The metadata of the long-term memory.",
              required: false,
              of: {
                id: {
                  type: "string",
                  desc: "The stable memory ID.",
                  required: true,
                },
                desc: {
                  type: "string",
                  desc: "The description of the data.",
                  required: true,
                },
              },
            },
          },
        },
      },
      {
        fn: async (args: Dict<any>) => {
          const list = this.db
            .prepare("SELECT id, desc, data FROM vec_items")
            .all();
          return {
            list: list.map((item) => ({
              id: String(item.id),
              desc: String(item.desc),
              data: JSON.parse(String(item.data)),
            })),
          };
        },
      },
    );
    agent.registerTool(
      {
        name: "ltm/retrieve",
        desc: "Retrieve data from your long-term memory.",
        risk: "network",
        privacy: { sendsNetwork: true, mayExposeUserData: true },
        args: {
          query: {
            type: "string",
            desc: "The query to retrieve the data.",
            required: true,
          },
        },
        retvals: {
          list: {
            type: "array",
            desc: "Query results list of metadata of the long-term memory.",
            required: true,
            of: {
              type: "object",
              desc: "The desc and data of the long-term memory.",
              required: false,
              of: {
                id: {
                  type: "string",
                  desc: "The stable memory ID.",
                  required: true,
                },
                desc: {
                  type: "string",
                  desc: "The description of the data.",
                  required: true,
                },
                data: {
                  type: "object",
                  desc: "The data.",
                  required: true,
                },
              },
            },
          },
        },
      },
      {
        fn: async (args) => {
          const embedding = await this.openai.embeddings.create({
            model: this.config.vector_model,
            dimensions: this.config.dimensions,
            input: args.query,
            encoding_format: "float",
          });
          agent.recordModelCall(
            this.config.vector_model,
            this.config.base_url,
            "ltm/retrieve created a query embedding.",
          );
          const results = this.db
            .prepare(
              `SELECT 
            distance,
            id,
            desc, 
            data
          FROM vec_items 
          WHERE embedding MATCH ?
          ORDER BY distance 
          LIMIT ${this.config.max_query_results}`,
            )
            .all(Float32Array.from(embedding.data[0].embedding));
          if (!results || results.length === 0) {
            throw new Error("No results found");
          }
          return {
            list: results.map((result) => {
              if (!result || typeof result !== "object") {
                throw new Error("Invalid result format");
              }
              return {
                id: String(result.id),
                desc: String(result.desc),
                data: JSON.parse(String(result.data)),
              };
            }),
          };
        },
      },
    );
    agent.registerTool(
      {
        name: "ltm/delete",
        desc: "Delete a long-term memory by stable ID.",
        risk: "destructive",
        args: {
          id: {
            type: "string",
            desc: "The stable memory ID.",
            required: true,
          },
        },
        retvals: {
          status: {
            type: "string",
            desc: "The status of the operation.",
            required: true,
          },
        },
      },
      {
        fn: async (args) => {
          this.db.prepare("DELETE FROM vec_items WHERE id = ?").run(args.id);
          return { status: "success" };
        },
      },
    );
  }

  async unload(agent: Talos) {
    agent.deregisterTool("ltm/store");
    agent.deregisterTool("ltm/list");
    agent.deregisterTool("ltm/retrieve");
    agent.deregisterTool("ltm/delete");
  }

  state() {
    return { store: this.store };
  }

  setState(state: Dict<any>) {
    this.store = state.store;
  }
}
