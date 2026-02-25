import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ChatInput } from "./ChatInput";

describe("ChatInput", () => {
  it("sends text and Enter on submit via button", () => {
    const onSendText = vi.fn();
    const onSendKey = vi.fn();
    render(<ChatInput onSendText={onSendText} onSendKey={onSendKey} />);

    const textarea = screen.getByPlaceholderText(/Type a message/);
    fireEvent.change(textarea, { target: { value: "hello" } });
    fireEvent.click(screen.getByText("Send"));

    expect(onSendText).toHaveBeenCalledWith("hello");
    expect(onSendKey).toHaveBeenCalledWith("Enter");
  });

  it("clears input after submit", () => {
    render(<ChatInput onSendText={() => {}} onSendKey={() => {}} />);

    const textarea = screen.getByPlaceholderText(/Type a message/) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "test" } });
    fireEvent.click(screen.getByText("Send"));

    expect(textarea.value).toBe("");
  });

  it("does not send empty text", () => {
    const onSendText = vi.fn();
    const onSendKey = vi.fn();
    render(<ChatInput onSendText={onSendText} onSendKey={onSendKey} />);

    fireEvent.click(screen.getByText("Send"));

    expect(onSendText).not.toHaveBeenCalled();
  });

  it("sends special key when key button clicked", () => {
    const onSendKey = vi.fn();
    render(<ChatInput onSendText={() => {}} onSendKey={onSendKey} />);

    fireEvent.click(screen.getByText("Esc"));
    expect(onSendKey).toHaveBeenCalledWith("Escape");

    fireEvent.click(screen.getByText("Tab"));
    expect(onSendKey).toHaveBeenCalledWith("Tab");
  });
});
