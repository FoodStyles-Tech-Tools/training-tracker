"use client";

import * as React from "react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

// Import Quill CSS
import "quill/dist/quill.snow.css";

export interface QuillEditorProps {
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
}

export const QuillEditor = React.forwardRef<HTMLDivElement, QuillEditorProps>(
  ({ value = "", onChange, placeholder, disabled, className, id, ...props }, ref) => {
    const editorRef = useRef<HTMLDivElement>(null);
    const quillInstanceRef = useRef<any>(null);
    const isInitializedRef = useRef(false);
    const [isClient, setIsClient] = useState(false);

    // Combine refs
    const combinedRef = React.useCallback(
      (node: HTMLDivElement | null) => {
        editorRef.current = node;
        if (typeof ref === "function") {
          ref(node);
        } else if (ref) {
          ref.current = node;
        }
      },
      [ref],
    );

    // Ensure we're on the client side
    useEffect(() => {
      setIsClient(true);
    }, []);

    useEffect(() => {
      if (!isClient || !editorRef.current || isInitializedRef.current) return;

      const initQuill = async () => {
        try {
          const QuillClass = (await import("quill")).default;
          if (!QuillClass || !editorRef.current || isInitializedRef.current) return;

          quillInstanceRef.current = new QuillClass(editorRef.current, {
            theme: "snow",
            placeholder: placeholder || "",
            readOnly: disabled || false,
            modules: {
              toolbar: [
                [{ header: [false, 2, 3] }],
                ["bold", "italic", "underline"],
                ["link"],
                [{ list: "ordered" }, { list: "bullet" }],
                ["clean"],
              ],
            },
          });

          // Set initial value
          if (value) {
            quillInstanceRef.current.root.innerHTML = value;
          }

          // Handle text changes
          quillInstanceRef.current.on("text-change", () => {
            if (onChange && quillInstanceRef.current) {
              const content = quillInstanceRef.current.root.innerHTML;
              onChange(content);
            }
          });

          isInitializedRef.current = true;
        } catch (error) {
          console.error("Failed to initialize Quill:", error);
        }
      };

      initQuill();

      return () => {
        if (quillInstanceRef.current) {
          quillInstanceRef.current = null;
          isInitializedRef.current = false;
        }
      };
    }, [isClient]); // Only run once on mount

    // Update value when it changes externally
    useEffect(() => {
      if (quillInstanceRef.current && value !== undefined && isInitializedRef.current) {
        const currentContent = quillInstanceRef.current.root.innerHTML;
        // Only update if the content is different to avoid infinite loops
        if (currentContent !== value) {
          quillInstanceRef.current.root.innerHTML = value || "";
        }
      }
    }, [value, isClient]);

    // Update readOnly state
    useEffect(() => {
      if (quillInstanceRef.current && isInitializedRef.current) {
        quillInstanceRef.current.enable(!disabled);
      }
    }, [disabled, isClient]);

    return (
      <div className={cn("quill-wrapper", className)} id={id} {...props}>
        <div ref={combinedRef} style={{ minHeight: "120px" }} />
      </div>
    );
  },
);

QuillEditor.displayName = "QuillEditor";

