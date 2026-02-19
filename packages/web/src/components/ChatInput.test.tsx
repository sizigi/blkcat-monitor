import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ChatInput } from "./ChatInput";

describe("ChatInput", () => {
  it("calls onSend with text + newline on submit", () => {
    const onSend = vi.fn();
    render(<ChatInput onSend={onSend} />);

    const input = screen.getByPlaceholderText("Type a command...");
    fireEvent.change(input, { target: { value: "hello" } });
    fireEvent.click(screen.getByText("Send"));

    expect(onSend).toHaveBeenCalledWith("hello\n");
  });

  it("clears input after submit", () => {
    render(<ChatInput onSend={() => {}} />);

    const input = screen.getByPlaceholderText("Type a command...") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "test" } });
    fireEvent.click(screen.getByText("Send"));

    expect(input.value).toBe("");
  });

  it("does not send empty text", () => {
    const onSend = vi.fn();
    render(<ChatInput onSend={onSend} />);

    fireEvent.click(screen.getByText("Send"));

    expect(onSend).not.toHaveBeenCalled();
  });
});
