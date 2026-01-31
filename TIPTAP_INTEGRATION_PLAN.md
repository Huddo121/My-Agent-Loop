# Research Plan: Adding TipTap Rich Text Editor to the Task Board

## Executive Summary

This document outlines a comprehensive plan to integrate **TipTap** as a rich text editor for task descriptions in the task board application. The solution will store content as **Markdown** to maintain readability in raw form and enable easy modification by AI agents.

## Current State Analysis

### Data Flow
1. **Database Layer** (`apps/server/src/db/schema.ts`):
   - `tasksTable.description` is defined as `pg.text().notNull()`
   - Stores plain text without formatting

2. **API Layer** (`packages/api/src/tasks/tasks-api.ts`):
   - `taskDtoSchema.description` uses `z.string()`
   - `CreateTaskRequest` and `UpdateTaskRequest` both expect string descriptions

3. **Frontend Types** (`apps/frontend/app/types/task.ts`):
   - `Task.description`, `NewTask.description`, and `UpdateTask.description` are all `string` types

4. **UI Layer** (`apps/frontend/app/components/tasks/TaskDialog.tsx`):
   - Uses a simple `<textarea>` for description input
   - No formatting capabilities

### Technology Stack
- **Frontend**: React Router 7, React 19, TypeScript, Tailwind CSS 4, shadcn/ui components
- **Backend**: Hono, Drizzle ORM, PostgreSQL
- **API**: Cerato for type-safe endpoints
- **Package Manager**: pnpm (monorepo workspace)

## Proposed Solution

### Why TipTap?

**TipTap** is a headless, framework-agnostic rich text editor built on ProseMirror. Key advantages:

1. **Markdown Support**: Native `@tiptap/markdown` extension for seamless markdown parsing/serialization
2. **Headless Design**: Full control over UI/styling - integrates perfectly with shadcn/ui and Tailwind
3. **Extensible**: Rich ecosystem of extensions (headings, lists, links, code blocks, etc.)
4. **AI-Friendly**: Markdown output is human-readable and easily processable by AI agents
5. **TypeScript First**: Excellent TypeScript support matching our codebase standards

### Why Markdown?

1. **Human Readable**: Raw database content remains understandable without rendering
2. **AI Compatible**: Agents can easily read and modify markdown text
3. **Portable**: Industry standard format, easy to export/import
4. **Git Friendly**: Diff-friendly format for version control
5. **Backward Compatible**: Existing plain text descriptions are valid markdown

## Implementation Plan

### Phase 1: Dependency Installation

Install required TipTap packages in the frontend application:

```bash
# Core packages
pnpm add @tiptap/react @tiptap/core @tiptap/pm

# Starter kit with essential extensions
pnpm add @tiptap/starter-kit

# Markdown support
pnpm add @tiptap/markdown

# Additional extensions for rich formatting
pnpm add @tiptap/extension-link @tiptap/extension-placeholder
```

**Dependencies to add to `apps/frontend/package.json`**:
- `@tiptap/react`: React integration
- `@tiptap/core`: Core editor functionality
- `@tiptap/pm`: ProseMirror dependencies
- `@tiptap/starter-kit`: Essential extensions (bold, italic, headings, lists, etc.)
- `@tiptap/markdown`: Markdown parsing and serialization
- `@tiptap/extension-link`: Link support
- `@tiptap/extension-placeholder`: Placeholder text

### Phase 2: Create TipTap Editor Component

Create a new reusable rich text editor component at `apps/frontend/app/components/ui/rich-text-editor.tsx`:

**Component Features**:
- Markdown input/output
- Toolbar with formatting options (bold, italic, headings, lists, links)
- Placeholder text support
- Controlled component pattern (value/onChange props)
- shadcn/ui styling integration
- Keyboard shortcuts (Cmd+B for bold, Cmd+I for italic, etc.)

**Key Implementation Details**:
```typescript
// Editor configuration
const editor = useEditor({
  extensions: [
    StarterKit,
    Markdown.configure({
      html: false,              // Disable HTML for security
      tightLists: true,         // Compact list formatting
      bulletListMarker: '-',    // Use dashes for bullets
      linkify: true,            // Auto-convert URLs to links
    }),
    Link.configure({
      openOnClick: false,       // Don't open links when editing
    }),
    Placeholder.configure({
      placeholder: 'Add a description...',
    }),
  ],
  content: initialMarkdown,     // Load markdown content
  onUpdate: ({ editor }) => {
    onChange(editor.storage.markdown.getMarkdown()); // Output markdown
  },
});
```

### Phase 3: Update TaskDialog Component

Modify `apps/frontend/app/components/tasks/TaskDialog.tsx`:

**Changes Required**:
1. Replace `<textarea>` with new `<RichTextEditor>` component
2. Import and use the markdown-enabled editor
3. Maintain existing form submission logic
4. Ensure keyboard shortcuts don't conflict (Cmd+Enter to submit)

**Implementation Notes**:
- The `description` state will continue to store string values (now markdown-formatted)
- No changes needed to the `onSubmit` handler
- Dialog height may need adjustment to accommodate the richer editor

### Phase 4: Update TaskCard Component

Modify `apps/frontend/app/components/tasks/TaskCard.tsx` to render markdown descriptions:

**Options**:
1. **Simple approach**: Use a markdown-to-HTML library (e.g., `marked`, `react-markdown`) to render description
2. **TipTap render**: Use TipTap's `generateHTML` or `EditorContent` in read-only mode

**Recommendation**: Use `react-markdown` for rendering (lighter weight, no editor overhead):

```bash
pnpm add react-markdown
```

**Security Consideration**: Ensure markdown rendering sanitizes HTML to prevent XSS attacks.

### Phase 5: Styling and Theming

**CSS Requirements**:
- Import TipTap editor styles
- Customize toolbar to match shadcn/ui design system
- Ensure dark mode compatibility
- Style markdown output (prose styles for rendered content)

**Files to create/modify**:
1. `apps/frontend/app/styles/tiptap.css` - Custom editor styles
2. Update Tailwind configuration if needed for prose typography

### Phase 6: Database and API Considerations

**Good News**: No database migration required!

- Markdown is plain text, so the existing `pg.text()` column is sufficient
- Existing plain text descriptions remain valid (plain text is valid markdown)

**API Compatibility**:
- No changes needed to Zod schemas - `z.string()` accepts markdown
- All existing API endpoints continue to work
- Backward compatible with existing data

### Phase 7: Migration Strategy

**Zero-Downtime Migration**:
1. Deploy code changes (frontend and backend remain compatible)
2. Existing plain text descriptions work immediately
3. New/edited tasks get markdown formatting
4. No data migration scripts needed

## Detailed Component Architecture

### RichTextEditor Component Structure

```
app/components/ui/rich-text-editor.tsx
├── EditorProvider (TipTap context)
├── Toolbar (formatting controls)
│   ├── BoldButton
│   ├── ItalicButton
│   ├── HeadingDropdown (H1, H2, H3)
│   ├── BulletListButton
│   ├── OrderedListButton
│   └── LinkButton
└── EditorContent (editable area)
```

### Toolbar Features

**Formatting Options** (Phase 1):
- Bold (Cmd+B)
- Italic (Cmd+I)
- Headings (H1, H2, H3)
- Bullet lists
- Numbered lists
- Links (Cmd+K)
- Blockquotes
- Code blocks
- Horizontal rule

**Future Enhancements** (Phase 2+):
- Task lists (checkboxes)
- Tables
- Images (with upload)
- Mentions (@username)
- Slash commands (/ for quick formatting)

## File Changes Summary

### New Files
1. `apps/frontend/app/components/ui/rich-text-editor.tsx` - Main editor component
2. `apps/frontend/app/components/ui/rich-text-editor-toolbar.tsx` - Toolbar component
3. `apps/frontend/app/styles/tiptap.css` - Editor-specific styles

### Modified Files
1. `apps/frontend/package.json` - Add TipTap dependencies
2. `apps/frontend/app/components/tasks/TaskDialog.tsx` - Replace textarea with editor
3. `apps/frontend/app/components/tasks/TaskCard.tsx` - Add markdown rendering
4. `apps/frontend/app/root.tsx` - Import editor styles

### Unchanged Files
- Database schema (no migration needed)
- API types and schemas (strings work for markdown)
- Backend handlers (no logic changes required)

## Testing Strategy

### Unit Tests
- Editor component renders correctly
- Markdown parsing/serialization roundtrip
- Toolbar buttons apply correct formatting

### Integration Tests
- Creating task with formatted description
- Editing task preserves formatting
- Markdown output is valid and storable

### E2E Tests
- User can format text using toolbar
- User can format text using keyboard shortcuts
- Formatted descriptions display correctly in task cards

## Security Considerations

1. **XSS Prevention**:
   - Disable HTML input in markdown configuration (`html: false`)
   - Sanitize rendered markdown output
   - Use TipTap's built-in security features

2. **Content Validation**:
   - Maintain existing Zod validation (string type)
   - Optional: Add max length validation for descriptions

3. **Link Safety**:
   - Links open in new tab with `rel="noopener noreferrer"`
   - Validate URLs before converting to links

## Performance Considerations

1. **Bundle Size**:
   - TipTap is modular - only import needed extensions
   - Estimated increase: ~100-200KB gzipped
   - Consider code-splitting for editor component

2. **Rendering Performance**:
   - Use React.memo for editor component
   - Debounce onChange callbacks if needed
   - Lazy load editor in dialogs (already modal-based)

3. **Database Performance**:
   - Markdown is typically slightly larger than plain text (formatting characters)
   - Negligible impact on database performance
   - No indexing changes required

## Future Enhancements

### Phase 2 Features
1. **Task Lists**: Checkboxes within descriptions for sub-tasks
2. **Slash Commands**: Type `/` for quick formatting access
3. **Mentions**: `@agent` to reference AI agents or users
4. **Image Support**: Drag-and-drop or paste images

### Phase 3 Features
1. **Collaborative Editing**: Real-time collaboration via Yjs
2. **Version History**: Track description changes over time
3. **AI Integration**: AI-powered formatting suggestions
4. **Templates**: Pre-defined description templates

## Alternative Solutions Considered

### 1. MDX Editor
- **Pros**: Full MDX support (React components in markdown)
- **Cons**: Overkill for our needs, larger bundle size
- **Verdict**: Too complex for current requirements

### 2. Monaco Editor (VS Code)
- **Pros**: Powerful, familiar interface
- **Cons**: Heavyweight, designed for code not prose
- **Verdict**: Not suitable for rich text editing

### 3. Quill.js
- **Pros**: Popular, easy to use
- **Cons**: HTML output (not markdown), less extensible
- **Verdict**: Doesn't meet markdown requirement

### 4. Slate.js
- **Pros**: Highly customizable
- **Cons**: Requires significant boilerplate, no built-in markdown
- **Verdict**: More work than TipTap for same result

## Conclusion

Integrating TipTap with markdown storage provides the ideal balance of:
- **User Experience**: Rich formatting without complexity
- **Developer Experience**: TypeScript-first, excellent docs
- **AI Compatibility**: Markdown is easily parsed and generated
- **Maintainability**: Clean, modular architecture
- **Future-Proof**: Extensible for advanced features

The implementation requires minimal changes to existing code while providing significant value to users structuring complex tasks and feature specifications.

## Appendix: Code Examples

### Example 1: RichTextEditor Component Skeleton

```tsx
// apps/frontend/app/components/ui/rich-text-editor.tsx
"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Markdown from "@tiptap/extension-markdown";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { RichTextEditorToolbar } from "./rich-text-editor-toolbar";

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function RichTextEditor({
  value,
  onChange,
  placeholder = "Add a description...",
}: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Markdown.configure({
        html: false,
        tightLists: true,
        bulletListMarker: "-",
        linkify: true,
      }),
      Link.configure({ openOnClick: false }),
      Placeholder.configure({ placeholder }),
    ],
    content: value,
    onUpdate: ({ editor }) => {
      onChange(editor.storage.markdown.getMarkdown());
    },
  });

  return (
    <div className="border rounded-md">
      <RichTextEditorToolbar editor={editor} />
      <EditorContent
        editor={editor}
        className="p-3 min-h-[120px] prose prose-sm max-w-none"
      />
    </div>
  );
}
```

### Example 2: TaskDialog Integration

```tsx
// In TaskDialog.tsx, replace textarea with:
import { RichTextEditor } from "~/components/ui/rich-text-editor";

// ... inside the form:
<div className="flex flex-col gap-2">
  <label htmlFor="description" className="text-sm font-medium">
    Description
  </label>
  <RichTextEditor
    value={description}
    onChange={setDescription}
    placeholder="Task description (supports markdown formatting)"
  />
</div>
```

### Example 3: Markdown Rendering in TaskCard

```tsx
// apps/frontend/app/components/tasks/TaskCard.tsx
import ReactMarkdown from "react-markdown";

// ... in the component render:
{task.description && (
  <div className="prose prose-sm mt-2">
    <ReactMarkdown>{task.description}</ReactMarkdown>
  </div>
)}
```

---

**Document Version**: 1.0  
**Created**: January 2026  
**Status**: Ready for Review
