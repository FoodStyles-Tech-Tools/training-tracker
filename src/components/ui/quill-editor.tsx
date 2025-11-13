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

    // Helper function to normalize HTML content for proper formatting
    const normalizeContent = React.useCallback((html: string): string => {
      if (!html || html.trim() === "") return "";
      
      // If content doesn't have proper paragraph tags, wrap it
      if (typeof document === "undefined") return html;
      
      const tempDiv = document.createElement("div");
      tempDiv.innerHTML = html;
      
      // Check if content has block elements
      const hasBlockElements = tempDiv.querySelector("p, div, h1, h2, h3, h4, h5, h6, ul, ol, li");
      
      if (!hasBlockElements) {
        // Replace <br> tags with paragraph breaks first
        let processedHtml = html.replace(/<br\s*\/?>/gi, "\n");
        
        // Split by line breaks and wrap each line in a paragraph
        const lines = processedHtml.split(/\r?\n/).filter(line => {
          // Remove HTML tags for checking if line has content
          const textContent = line.replace(/<[^>]*>/g, "").trim();
          return textContent !== "";
        });
        
        if (lines.length > 0) {
          return lines.map(line => {
            const trimmed = line.trim();
            // If line already has HTML tags, keep them; otherwise wrap in <p>
            if (trimmed.startsWith("<") && trimmed.endsWith(">")) {
              return trimmed;
            }
            return `<p>${trimmed}</p>`;
          }).join("");
        }
        // If no line breaks, wrap the whole content
        return `<p>${html.trim()}</p>`;
      }
      
      // If it has block elements but might have <br> tags that should be converted
      // Replace <br> tags with proper spacing in paragraphs
      // Use [\s\S] instead of . with s flag for ES2017 compatibility
      return html.replace(/(<p[^>]*>)([\s\S]*?)(<\/p>)/gi, (match, openTag, content, closeTag) => {
        // Replace <br> with closing and opening paragraph tags for better spacing
        const processedContent = content.replace(/<br\s*\/?>/gi, "</p><p>");
        return `${openTag}${processedContent}${closeTag}`;
      });
    }, []);

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
              toolbar: disabled ? false : [
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
            // Normalize content for better formatting, especially in readonly mode
            const normalizedContent = disabled ? normalizeContent(value) : value;
            quillInstanceRef.current.root.innerHTML = normalizedContent;
            
            // Force Quill to update its internal representation
            if (disabled) {
              setTimeout(() => {
                if (quillInstanceRef.current) {
                  quillInstanceRef.current.update();
                }
              }, 0);
            }
          }

          // Handle text changes - check flag to prevent recursive updates
          quillInstanceRef.current.on("text-change", () => {
            const quillInstance = quillInstanceRef.current as any;
            if (onChange && quillInstance && !quillInstance.__isUpdatingFromExternal) {
              const content = quillInstance.root.innerHTML;
              onChange(content);
            }
          });
          
          // Initialize the flag
          (quillInstanceRef.current as any).__isUpdatingFromExternal = false;

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
    }, [isClient, disabled, normalizeContent, placeholder]); // Only run once on mount - value is handled separately

    // Update value when it changes externally
    useEffect(() => {
      if (quillInstanceRef.current && value !== undefined && isInitializedRef.current) {
        const currentContent = quillInstanceRef.current.root.innerHTML.trim();
        const newValue = (value || "").trim();
        
        // Only update if the content is actually different to avoid infinite loops
        // Compare normalized versions to handle minor HTML differences
        const normalizeForComparison = (html: string) => {
          if (!html) return "";
          // Remove extra whitespace and normalize
          return html.replace(/\s+/g, " ").replace(/>\s+</g, "><").trim();
        };
        
        const normalizedCurrent = normalizeForComparison(currentContent);
        const normalizedNew = normalizeForComparison(newValue);
        
        if (normalizedCurrent !== normalizedNew) {
          // Set flag to prevent text-change event from firing during external update
          const quillInstance = quillInstanceRef.current as any;
          quillInstance.__isUpdatingFromExternal = true;
          
          try {
            // Use Quill's clipboard API to properly convert HTML to Delta format
            // This prevents header duplication issues when updating content
            try {
              // Convert HTML string to Delta using clipboard
              const delta = quillInstance.clipboard.convert(newValue);
              // Use setContents with 'silent' source to prevent triggering text-change events
              quillInstance.setContents(delta, "silent");
            } catch (error) {
              // Fallback to innerHTML if clipboard conversion fails
              console.warn("Quill clipboard conversion failed, using innerHTML fallback:", error);
              const normalizedContent = disabled ? normalizeContent(value || "") : (value || "");
              quillInstance.root.innerHTML = normalizedContent;
            }
            
            // Force Quill to update its internal representation
            if (disabled && quillInstance) {
              setTimeout(() => {
                if (quillInstance) {
                  quillInstance.update();
                }
              }, 0);
            }
          } finally {
            // Reset flag after a short delay to allow Quill to process
            setTimeout(() => {
              if (quillInstance) {
                quillInstance.__isUpdatingFromExternal = false;
              }
            }, 0);
          }
        }
      }
    }, [value, disabled, isClient, normalizeContent]);

    // Update readOnly state and toolbar visibility
    useEffect(() => {
      if (quillInstanceRef.current && isInitializedRef.current) {
        quillInstanceRef.current.enable(!disabled);
        // Hide/show toolbar based on disabled state
        const toolbarElement = editorRef.current?.querySelector(".ql-toolbar");
        if (toolbarElement && toolbarElement instanceof HTMLElement) {
          if (disabled) {
            toolbarElement.style.display = "none";
          } else {
            toolbarElement.style.display = "";
          }
        }
      }
    }, [disabled, isClient]);

    // Update placeholder dynamically based on content and placeholder prop
    useEffect(() => {
      if (quillInstanceRef.current && isInitializedRef.current && editorRef.current) {
        const root = quillInstanceRef.current.root as HTMLElement;
        const hasContent = value && value.trim() !== "" && value !== "<p><br></p>";
        const textOnly = value ? value.replace(/<[^>]*>/g, "").trim() : "";
        const isEmpty = !hasContent || textOnly === "";
        
        // Update placeholder: show only if empty and placeholder prop is provided
        if (isEmpty && placeholder) {
          root.setAttribute("data-placeholder", placeholder);
        } else {
          root.removeAttribute("data-placeholder");
        }
      }
    }, [value, placeholder, isClient]);

    return (
      <div className={cn("quill-wrapper", disabled && "quill-readonly", className)} id={id} {...props}>
        <div ref={combinedRef} style={{ minHeight: "120px" }} />
      </div>
    );
  },
);

QuillEditor.displayName = "QuillEditor";

