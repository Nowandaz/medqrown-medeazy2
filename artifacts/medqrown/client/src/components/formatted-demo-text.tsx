import React from "react";

type FormattedDemoTextProps = {
  text: string;
  className?: string;
};

// Only **bold** is supported. React escapes all other characters, including
// HTML supplied from the database, rather than interpreting it as markup.
export function FormattedDemoText({ text, className }: FormattedDemoTextProps) {
  return (
    <p className={className}>
      {text.split(/(\*\*[^*]+\*\*)/g).map((part, index) =>
        part.startsWith("**") && part.endsWith("**")
          ? <strong key={index}>{part.slice(2, -2)}</strong>
          : part
      )}
    </p>
  );
}