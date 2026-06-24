import React, { useState } from "react";
import { Box, Text, useInput, useApp, Key, useStdout } from "ink";
import { ITalosApprovalRequest } from "../../../core/talos.js";

export interface Message {
  type: "user" | "agent" | "thinking" | "tool-call" | "tool-result" | "event";
  content: string;
  timestamp: string;
}

interface AppProps {
  onMessage: (content: string) => void;
  messages: Message[];
  prompt: string;
  isThinking: boolean;
  pendingApproval?: ITalosApprovalRequest;
}

export const App: React.FC<AppProps> = ({
  onMessage,
  messages,
  prompt,
  isThinking,
  pendingApproval,
}) => {
  const [input, setInput] = useState("");
  const [cursorPosition, setCursorPosition] = useState(0);
  const { exit } = useApp();
  const { stdout } = useStdout();
  const width = Math.max(stdout.columns ?? 100, 60);
  const historyLimit = Math.max((stdout.rows ?? 30) - 12, 8);
  const visibleMessages = messages.slice(-historyLimit);

  useInput((char: string, key: Key) => {
    // Handle Ctrl+C
    if (key.ctrl && char === "c") {
      exit();
      return;
    }

    if (key.ctrl && char === "u") {
      setInput("");
      setCursorPosition(0);
      return;
    }

    // Handle Enter
    if (key.return) {
      if (input.trim()) {
        onMessage(input);
      }
      setInput("");
      setCursorPosition(0);
      return;
    }

    // Handle Backspace
    if (key.backspace || key.delete) {
      if (cursorPosition > 0) {
        const newInput =
          input.slice(0, cursorPosition - 1) + input.slice(cursorPosition);
        setInput(newInput);
        setCursorPosition(cursorPosition - 1);
      }
      return;
    }

    // Handle Left Arrow
    if (key.leftArrow) {
      setCursorPosition(Math.max(0, cursorPosition - 1));
      return;
    }

    // Handle Right Arrow
    if (key.rightArrow) {
      setCursorPosition(Math.min(input.length, cursorPosition + 1));
      return;
    }

    // Handle regular character input
    if (char && char.length === 1) {
      const newInput =
        input.slice(0, cursorPosition) + char + input.slice(cursorPosition);
      setInput(newInput);
      setCursorPosition(cursorPosition + 1);
    }
  });

  const promptLabel = pendingApproval
    ? "approval"
    : isThinking
      ? "busy"
      : "you";
  const promptColor = pendingApproval
    ? "yellow"
    : isThinking
      ? "cyan"
      : "green";

  return (
    <Box flexDirection="column" width={width}>
      <Box
        borderStyle="single"
        borderColor="gray"
        paddingX={1}
        justifyContent="space-between"
      >
        <Text bold color="cyan">
          Talos
        </Text>
        <Text color="gray">
          /privacy /audit /approvals /models /skills /task
        </Text>
      </Box>

      <Box flexDirection="column" paddingX={1} marginTop={1}>
        {visibleMessages.map((message) => (
          <MessageRow key={message.timestamp} message={message} />
        ))}
        {messages.length > visibleMessages.length && (
          <Box marginTop={1}>
            <Text color="gray">
              Showing latest {visibleMessages.length} of {messages.length}{" "}
              messages
            </Text>
          </Box>
        )}
      </Box>

      {pendingApproval && (
        <Box
          flexDirection="column"
          borderStyle="single"
          borderColor="yellow"
          paddingX={1}
          paddingY={1}
          marginTop={1}
        >
          <Text bold color="yellow">
            Approval required
          </Text>
          <Text>
            <Text color="yellow">{pendingApproval.risk.toUpperCase()}</Text>{" "}
            {pendingApproval.tool}
          </Text>
          <Text>{pendingApproval.summary}</Text>
          <Text color="gray">Args: {JSON.stringify(pendingApproval.args)}</Text>
          <Text color="yellow">Type y to approve or n to deny.</Text>
        </Box>
      )}

      <Box
        borderStyle="single"
        borderColor={promptColor}
        paddingX={1}
        marginTop={1}
      >
        <Text color={promptColor}>{promptLabel} </Text>
        <Text>
          {input.slice(0, cursorPosition)}
          <Text inverse> </Text>
          {input.slice(cursorPosition)}
        </Text>
      </Box>
    </Box>
  );
};

const MessageRow: React.FC<{ message: Message }> = ({ message }) => {
  const metadata = messageMetadata(message.type);
  const lines = message.content.split("\n");

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Box width={12}>
          <Text color={metadata.color} bold={metadata.bold}>
            {metadata.label}
          </Text>
        </Box>
        <Text color={metadata.contentColor}>{lines[0] ?? ""}</Text>
      </Box>
      {lines.slice(1).map((line, index) => (
        <Box key={`${message.timestamp}-${index}`} paddingLeft={12}>
          <Text color={metadata.contentColor}>{line}</Text>
        </Box>
      ))}
    </Box>
  );
};

function messageMetadata(type: Message["type"]) {
  switch (type) {
    case "user":
      return {
        label: "You",
        color: "green",
        contentColor: undefined,
        bold: true,
      } as const;
    case "agent":
      return {
        label: "Talos",
        color: "cyan",
        contentColor: undefined,
        bold: true,
      } as const;
    case "thinking":
      return {
        label: "Thinking",
        color: "blue",
        contentColor: "gray",
        bold: false,
      } as const;
    case "tool-call":
      return {
        label: "Tool",
        color: "magenta",
        contentColor: "gray",
        bold: false,
      } as const;
    case "tool-result":
      return {
        label: "Result",
        color: "green",
        contentColor: "gray",
        bold: false,
      } as const;
    case "event":
      return {
        label: "Event",
        color: "yellow",
        contentColor: "gray",
        bold: false,
      } as const;
  }
}
