import { SupabaseClient } from "@supabase/supabase-js";
import { format } from "winston";
import Transport from "winston-transport";

export default class WebappUITransport extends Transport {
  supabase: SupabaseClient;
  contextId: string;
  formatter: any;

  constructor(supabase: SupabaseClient, contextId: string) {
    super();
    this.supabase = supabase;
    this.contextId = contextId;
    this.formatter = format.combine(format.timestamp(), format.json());
  }

  log(info: any, callback: () => void) {
    const formattedInfo = this.formatter.transform(info);
    this.supabase
      .from("logs")
      .insert({
        context_id: this.contextId,
        log: formattedInfo,
      })
      .then(() => {
        callback();
      });
  }
}
