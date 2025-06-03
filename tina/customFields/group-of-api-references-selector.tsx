import React, { useEffect, useState } from "react";
import { wrapFieldsWithMeta } from "tinacms";
import { client } from "@/tina/__generated__/client";
import { config } from "@/tina/config";

const GroupOfApiReferencesSelector = wrapFieldsWithMeta((props: any) => {
  const { input, meta } = props;
  const [schemas, setSchemas] = useState<any[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [endpoints, setEndpoints] = useState<
    {
      id: string;
      label: string;
      method: string;
      path: string;
      summary: string;
      description: string;
    }[]
  >([]);
  const [loadingSchemas, setLoadingSchemas] = useState(true);
  const [loadingTags, setLoadingTags] = useState(false);
  const [loadingEndpoints, setLoadingEndpoints] = useState(false);
  const [selectedSchema, setSelectedSchema] = useState("");
  const [selectedTag, setSelectedTag] = useState("");
  const [generatingFiles, setGeneratingFiles] = useState(false);
  const [lastSavedValue, setLastSavedValue] = useState<string>("");

  // Detect if we're in local development mode
  const isLocalMode =
    process.env.NODE_ENV === "development" ||
    (typeof window !== "undefined" && window.location.hostname === "localhost");

  // Parse the current value
  const parsedValue = (() => {
    try {
      return input.value
        ? JSON.parse(input.value)
        : { schema: "", tag: "", endpoints: [] };
    } catch {
      return { schema: "", tag: "", endpoints: [] };
    }
  })();

  const selectedEndpoints = Array.isArray(parsedValue.endpoints)
    ? parsedValue.endpoints
    : [];

  // Detect form submission and trigger file generation
  useEffect(() => {
    const handleFormSave = async () => {
      // Check if this is a form save by detecting when the field becomes "not dirty"
      // and the value has changed from what we last processed
      const currentValue = input.value || "";
      const hasValidSelection =
        selectedSchema && selectedTag && selectedEndpoints.length > 0;

      console.log("🔍 Form save check:", {
        "meta.dirty": meta.dirty,
        "currentValue !== lastSavedValue": currentValue !== lastSavedValue,
        hasValidSelection: hasValidSelection,
        generatingFiles: generatingFiles,
        selectedSchema: selectedSchema,
        selectedTag: selectedTag,
        "selectedEndpoints.length": selectedEndpoints.length,
      });

      if (
        !meta.dirty &&
        currentValue !== lastSavedValue &&
        hasValidSelection &&
        !generatingFiles
      ) {
        console.log(
          "🔄 Form save detected - clearing tag directory and regenerating files"
        );
        setLastSavedValue(currentValue);
        setGeneratingFiles(true);

        try {
          // Step 1: Clear the entire tag directory
          const tagDir = sanitizeFileName(selectedTag);
          const tagDirectoryPath = `docs/api-documentation/${tagDir}`;

          console.log(`🗑️ About to clear directory: ${tagDirectoryPath}`);
          console.log(`🔍 selectedTag: "${selectedTag}"`);
          console.log(`🔍 sanitized tagDir: "${tagDir}"`);
          console.log(`🔍 full tagDirectoryPath: "${tagDirectoryPath}"`);
          await clearTagDirectory(tagDirectoryPath);

          // Step 2: Generate all selected files
          if (selectedEndpoints.length > 0) {
            console.log(`📁 Creating ${selectedEndpoints.length} files`);
            if (isLocalMode) {
              console.log("🏠 Local mode - using filesystem generation");
              await handleFileSystemGeneration();
            } else {
              console.log("☁️ Remote mode - using TinaCMS GraphQL generation");
              await handleTinaCMSGeneration();
            }
          }
        } catch (error) {
          console.error("File generation and cleanup failed:", error);
        } finally {
          setGeneratingFiles(false);
        }
      }
    };

    // Small delay to ensure meta.dirty state is updated
    const timeoutId = setTimeout(handleFormSave, 100);
    return () => clearTimeout(timeoutId);
  }, [
    meta.dirty,
    input.value,
    selectedSchema,
    selectedTag,
    selectedEndpoints.length,
    lastSavedValue,
    generatingFiles,
    isLocalMode,
  ]);

  // Load schemas from filesystem API
  useEffect(() => {
    const loadSchemas = async () => {
      setLoadingSchemas(true);
      try {
        console.log("Loading API schemas from filesystem...");

        const response = await fetch("/api/list-api-schemas");
        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || "Failed to load schemas");
        }

        console.log("API schema list result:", result);
        setSchemas(result.schemas || []);
        setLoadingSchemas(false);

        // Set local state from parsed values
        const currentSchema = parsedValue.schema || "";
        const currentTag = parsedValue.tag || "";
        setSelectedSchema(currentSchema);
        setSelectedTag(currentTag);

        // If we have existing data, load tags and endpoints
        if (currentSchema) {
          await loadTagsForSchema(currentSchema, currentTag);
        }
      } catch (error) {
        console.error("Error loading API schemas:", error);
        setSchemas([]);
        setLoadingSchemas(false);
      }
    };

    loadSchemas();
  }, []); // Run once on mount

  const loadTagsForSchema = async (
    schemaFilename: string,
    currentTag?: string
  ) => {
    setLoadingTags(true);
    try {
      const response = await fetch(
        `/api/get-api-schema?filename=${encodeURIComponent(schemaFilename)}`
      );
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Failed to load schema");
      }

      const apiSchema = result.apiSchema;
      if (apiSchema && apiSchema.paths) {
        const tagSet = new Set<string>();

        // Extract tags
        for (const path in apiSchema.paths) {
          for (const method in apiSchema.paths[path]) {
            const op = apiSchema.paths[path][method];
            if (op.tags) {
              op.tags.forEach((tag: string) => tagSet.add(tag));
            }
          }
        }

        const tagsList = Array.from(tagSet);
        setTags(tagsList);
        setLoadingTags(false);

        // If we also have a selected tag, load endpoints
        if (currentTag) {
          await loadEndpointsForTag(apiSchema, currentTag);
        }
      } else {
        setTags([]);
        setLoadingTags(false);
      }
    } catch (error) {
      console.error("Error loading tags for schema:", error);
      setTags([]);
      setLoadingTags(false);
    }
  };

  const loadEndpointsForTag = async (apiSchema: any, tag: string) => {
    setLoadingEndpoints(true);
    const endpointsList: {
      id: string;
      label: string;
      method: string;
      path: string;
      summary: string;
      description: string;
    }[] = [];

    for (const path in apiSchema.paths) {
      for (const method in apiSchema.paths[path]) {
        const op = apiSchema.paths[path][method];
        if (op.tags && op.tags.includes(tag)) {
          endpointsList.push({
            id: `${method.toUpperCase()}:${path}`,
            label: `${method.toUpperCase()} ${path} - ${op.summary || ""}`,
            method: method.toUpperCase(),
            path,
            summary: op.summary || "",
            description: op.description || "",
          });
        }
      }
    }

    setEndpoints(endpointsList);
    setLoadingEndpoints(false);
  };

  // Handle schema change
  const handleSchemaChange = async (
    e: React.ChangeEvent<HTMLSelectElement>
  ) => {
    const schema = e.target.value;

    // Only update if schema actually changed to reduce form disruption
    if (schema === selectedSchema) return;

    setSelectedSchema(schema);
    setSelectedTag("");
    setTags([]);
    setEndpoints([]);

    // Update form state once at the end
    input.onChange(JSON.stringify({ schema, tag: "", endpoints: [] }));

    if (!schema) {
      setLoadingTags(false);
      return;
    }

    await loadTagsForSchema(schema);
  };

  // Handle tag change
  const handleTagChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const tag = e.target.value;

    // Only update if tag actually changed
    if (tag === selectedTag) return;

    setSelectedTag(tag);
    setEndpoints([]);

    // Update form state once
    input.onChange(
      JSON.stringify({ schema: selectedSchema, tag, endpoints: [] })
    );

    if (!tag || !selectedSchema) {
      setLoadingEndpoints(false);
      return;
    }

    try {
      const response = await fetch(
        `/api/get-api-schema?filename=${encodeURIComponent(selectedSchema)}`
      );
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Failed to load schema");
      }

      await loadEndpointsForTag(result.apiSchema, tag);
    } catch (error) {
      console.error("Error loading endpoints:", error);
      setEndpoints([]);
      setLoadingEndpoints(false);
    }
  };

  const handleEndpointCheckbox = (id: string) => {
    let updated: typeof endpoints;
    const clickedEndpoint = endpoints.find((ep) => ep.id === id);
    if (!clickedEndpoint) return;

    if (selectedEndpoints.find((ep) => ep.id === id)) {
      updated = selectedEndpoints.filter((ep) => ep.id !== id);
    } else {
      updated = [...selectedEndpoints, clickedEndpoint];
    }
    input.onChange(
      JSON.stringify({
        schema: selectedSchema,
        tag: selectedTag,
        endpoints: updated,
      })
    );
  };

  const handleSelectAll = () => {
    input.onChange(
      JSON.stringify({
        schema: selectedSchema,
        tag: selectedTag,
        endpoints: endpoints,
      })
    );
  };

  const handleFileSystemGeneration = async () => {
    try {
      const response = await fetch("/api/generate-api-docs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          apiGroupData: input.value,
        }),
      });

      const result = await response.json();

      if (response.ok) {
        console.log(
          `✅ Created ${result.files.length} files via filesystem:`,
          result.files
        );

        showNotification(
          `📄 Generated ${result.files.length} MDX files locally`,
          "success"
        );
      } else {
        if (response.status === 403 && result.suggestion) {
          console.warn("⚠️ Filesystem generation not available:", result.error);
          showNotification(
            "⚠️ Filesystem generation not available in this environment",
            "warning"
          );
        } else {
          throw new Error(result.error || "Failed to generate files");
        }
      }
    } catch (error) {
      console.error("Filesystem generation failed:", error);
      showNotification(
        `❌ Failed to generate files: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        "error"
      );
    }
  };

  const handleTinaCMSGeneration = async () => {
    try {
      // Parse the group data
      let groupData;
      try {
        groupData =
          typeof input.value === "string"
            ? JSON.parse(input.value)
            : input.value;
      } catch (error) {
        throw new Error("Invalid API group data format");
      }

      // Filter endpoints to only create the specified files
      const filteredEndpoints = groupData.endpoints.filter((endpoint: any) => {
        const fileName = generateFileName(endpoint);
        const tagDir = sanitizeFileName(groupData.tag);
        const filePath = `docs/api-documentation/${tagDir}/${fileName}.mdx`;
        return selectedEndpoints.some((ep) => ep.id === endpoint.id);
      });

      // Create filtered group data for generation
      const filteredGroupData = {
        ...groupData,
        endpoints: filteredEndpoints,
      };

      // Call the client-side GraphQL function directly
      const results = await createDocsViaTinaClientSide(filteredGroupData);

      if (results.success) {
        console.log(
          `✅ Created ${results.createdFiles.length} files via TinaCMS GraphQL:`,
          results.createdFiles
        );

        showNotification(
          `✅ Created ${results.createdFiles.length} MDX files via TinaCMS`,
          "success"
        );
      } else {
        const errorMsg =
          results.errors.length > 0
            ? `Partially successful: created ${results.createdFiles.length} files, ${results.errors.length} errors`
            : "Failed to create files";
        console.warn("❌ TinaCMS generation issues:", results.errors);
        showNotification(`⚠️ ${errorMsg}`, "warning");
      }
    } catch (error) {
      console.error("TinaCMS generation failed:", error);
      showNotification(
        `❌ Failed to create files via TinaCMS: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        "error"
      );
    }
  };

  // Simple notification system (you could replace this with a toast library)
  const showNotification = (
    message: string,
    type: "success" | "warning" | "error"
  ) => {
    // For now, we'll use console.log with emojis, but you could implement a proper toast system
    const emoji = type === "success" ? "✅" : type === "warning" ? "⚠️" : "❌";
    console.log(`${emoji} ${message}`);

    // Optional: Show a temporary visual indicator
    if (typeof window !== "undefined") {
      const notification = document.createElement("div");
      notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${
          type === "success"
            ? "#10b981"
            : type === "warning"
            ? "#f59e0b"
            : "#ef4444"
        };
        color: white;
        padding: 12px 20px;
        border-radius: 8px;
        z-index: 1000;
        font-family: system-ui, -apple-system, sans-serif;
        font-size: 14px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        max-width: 400px;
      `;
      notification.textContent = message;
      document.body.appendChild(notification);

      setTimeout(() => {
        if (notification.parentNode) {
          notification.parentNode.removeChild(notification);
        }
      }, 4000);
    }
  };

  /**
   * Generates a safe filename from endpoint data
   */
  function generateFileName(endpoint: any): string {
    const method = endpoint.method.toLowerCase();
    const pathSafe = endpoint.path
      .replace(/^\//, "") // Remove leading slash
      .replace(/\//g, "-") // Replace slashes with dashes
      .replace(/[{}]/g, "") // Remove curly braces
      .replace(/[^\w-]/g, "") // Remove any non-word characters except dashes
      .toLowerCase();

    return `${method}-${pathSafe}`;
  }

  /**
   * Sanitizes a string to be used as a directory/file name
   */
  function sanitizeFileName(name: string): string {
    return name
      .replace(/[^\w\s-]/g, "") // Remove special characters except spaces and dashes
      .replace(/\s+/g, "-") // Replace spaces with dashes
      .toLowerCase();
  }

  /**
   * Creates docs via TinaCMS GraphQL mutation - CLIENT SIDE
   */
  async function createDocsViaTinaClientSide(groupData: any): Promise<{
    success: boolean;
    createdFiles: string[];
    errors: string[];
  }> {
    const results = {
      success: true,
      createdFiles: [] as string[],
      errors: [] as string[],
    };

    if (!groupData.endpoints || groupData.endpoints.length === 0) {
      return { ...results, success: false, errors: ["No endpoints provided"] };
    }

    const { schema, tag, endpoints } = groupData;
    const tagDir = sanitizeFileName(tag);

    // Get config values for logging purposes
    const clientId = config.clientId;
    const branch = config.branch;

    if (!clientId) {
      return {
        ...results,
        success: false,
        errors: ["Missing TinaCMS client ID in config"],
      };
    }

    if (!branch) {
      return {
        ...results,
        success: false,
        errors: ["Missing TinaCMS branch in config"],
      };
    }

    console.log(
      `Using TinaCMS client with Client ID: ${clientId}, Branch: ${branch}`
    );

    // Get token from localStorage using TinaCMS internal method
    const tinacmsAuthString = localStorage.getItem("tinacms-auth");
    console.log("tinacmsAuthString:", tinacmsAuthString);

    let token;
    try {
      const authData = tinacmsAuthString ? JSON.parse(tinacmsAuthString) : null;
      token = authData?.id_token || config.token;
      console.log("Extracted token:", token);
    } catch (e) {
      console.warn("Failed to parse tinacms-auth from localStorage:", e);
      token = config.token;
    }

    const tinaEndpoint = `https://content.tinajs.io/1.5/content/${clientId}/github/${branch}`;

    console.log(`Using TinaCMS Cloud endpoint: ${tinaEndpoint}`);
    console.log(`Client ID: ${clientId}, Branch: ${branch}`);
    console.log(`Token available: ${!!token}`);

    for (const endpoint of endpoints) {
      try {
        const fileName = generateFileName(endpoint);
        const relativePath = `docs/api-documentation/${tagDir}/${fileName}.mdx`;

        // Create title from summary or generate one
        const title = endpoint.summary || `${endpoint.method} ${endpoint.path}`;
        const description =
          endpoint.description ||
          `API endpoint for ${endpoint.method} ${endpoint.path}`;

        // Use fetch with the correct TinaCloud endpoint and auth token
        const mutation = `
          mutation AddPendingDocument($collection: String!, $relativePath: String!) {
            addPendingDocument(collection: $collection, relativePath: $relativePath) {
              __typename
            }
          }
        `;

        const variables = {
          collection: "docs",
          relativePath,
        };

        // Prepare headers with authentication using TinaCMS internal pattern
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };

        // Add auth token using the internal TinaCMS pattern
        if (token) {
          headers["Authorization"] = "Bearer " + token;
          console.log("Added Authorization header with TinaCMS token");
        } else {
          console.warn("No auth token available - request may fail");
        }

        const response = await fetch(tinaEndpoint, {
          method: "POST",
          headers,
          body: JSON.stringify({
            query: mutation,
            variables: variables,
          }),
        });

        console.log(`Response status: ${response.status} for ${tinaEndpoint}`);

        if (!response.ok) {
          let errorDetails = `HTTP error! status: ${response.status}`;
          try {
            const errorBody = await response.text();
            if (errorBody) {
              errorDetails += ` - Response: ${errorBody}`;
            }
          } catch (e) {
            // Ignore if we can't read the response body
          }
          throw new Error(errorDetails);
        }

        const result = await response.json();
        console.log("GraphQL response:", result);

        if (result.errors) {
          results.errors.push(
            `Failed to create ${relativePath}: ${result.errors
              .map((e: any) => e.message)
              .join(", ")}`
          );
          results.success = false;
        } else if (result.data?.addPendingDocument) {
          results.createdFiles.push(relativePath);
          console.log(`Created pending document via TinaCMS: ${relativePath}`);

          // Now try to update it with content
          try {
            const updateMutation = `
              mutation UpdateDocs($relativePath: String!, $params: DocsMutation!) {
                updateDocs(relativePath: $relativePath, params: $params) {
                  __typename
                  id
                  title
                }
              }
            `;

            const updateVariables = {
              relativePath,
              params: {
                title,
                last_edited: new Date().toISOString(),
                seo: {
                  title,
                  description,
                },
                // Skip body for now to avoid rich text issues
              },
            };

            const updateResponse = await fetch(tinaEndpoint, {
              method: "POST",
              headers,
              body: JSON.stringify({
                query: updateMutation,
                variables: updateVariables,
              }),
            });

            if (updateResponse.ok) {
              const updateResult = await updateResponse.json();
              if (updateResult.data?.updateDocs) {
                console.log(`Updated document content for: ${relativePath}`);
              }
            }
          } catch (updateError) {
            console.warn(
              `Failed to update content for ${relativePath}:`,
              updateError
            );
            // Don't fail the overall operation for update errors
          }
        } else {
          results.errors.push(
            `Failed to create ${relativePath}: No data returned`
          );
          results.success = false;
        }
      } catch (error) {
        const errorMsg = `Failed to create file for ${endpoint.method} ${
          endpoint.path
        }: ${error instanceof Error ? error.message : "Unknown error"}`;
        results.errors.push(errorMsg);
        results.success = false;
        console.error(errorMsg, error);
      }
    }

    return results;
  }

  // Clear the entire tag directory
  const clearTagDirectory = async (tagDirectoryPath: string) => {
    try {
      console.log(
        `🗑️ Clearing directory: ${tagDirectoryPath}, isLocalMode: ${isLocalMode}`
      );
      if (isLocalMode) {
        await clearDirectoryViaFilesystem(tagDirectoryPath);
      } else {
        await clearDirectoryViaTinaCMS(tagDirectoryPath);
      }
      console.log(`✅ Successfully cleared directory: ${tagDirectoryPath}`);
    } catch (error) {
      console.warn(`⚠️ Failed to clear directory ${tagDirectoryPath}:`, error);
      // Continue anyway - maybe the directory doesn't exist yet
    }
  };

  // Clear directory via filesystem API
  const clearDirectoryViaFilesystem = async (directoryPath: string) => {
    console.log(`🔥 Making API call to clear directory: ${directoryPath}`);
    const response = await fetch("/api/clear-directory", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ directoryPath }),
    });

    console.log(`📡 Clear directory API response status: ${response.status}`);

    if (!response.ok) {
      const result = await response.json();
      console.error("❌ Clear directory API error:", result);
      throw new Error(result.error || "Failed to clear directory");
    }

    const result = await response.json();
    console.log("✅ Clear directory API success:", result);
  };

  // Clear directory via TinaCMS GraphQL (list and delete all files)
  const clearDirectoryViaTinaCMS = async (directoryPath: string) => {
    const clientId = config.clientId;
    const branch = config.branch;

    if (!clientId || !branch) {
      throw new Error("Missing TinaCMS configuration for directory clearing");
    }

    const tinacmsAuthString = localStorage.getItem("tinacms-auth");
    let token;
    try {
      const authData = tinacmsAuthString ? JSON.parse(tinacmsAuthString) : null;
      token = authData?.id_token || config.token;
    } catch (e) {
      token = config.token;
    }

    const tinaEndpoint = `https://content.tinajs.io/1.5/content/${clientId}/github/${branch}`;

    // First, list all files in the directory via TinaCMS collection query
    const listQuery = `
      query GetDocsInDirectory {
        docsConnection(filter: {_sys: {filename: {startsWith: "${directoryPath}/"}}}) {
          edges {
            node {
              _sys {
                filename
                relativePath
              }
            }
          }
        }
      }
    `;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (token) {
      headers["Authorization"] = "Bearer " + token;
    }

    const listResponse = await fetch(tinaEndpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        query: listQuery,
      }),
    });

    if (!listResponse.ok) {
      throw new Error(`Failed to list files: HTTP ${listResponse.status}`);
    }

    const listResult = await listResponse.json();
    if (listResult.errors) {
      throw new Error(
        `List query errors: ${listResult.errors
          .map((e: any) => e.message)
          .join(", ")}`
      );
    }

    // Delete each file found in the directory
    const filesToDelete = listResult.data?.docsConnection?.edges || [];
    for (const edge of filesToDelete) {
      const relativePath = edge.node._sys.relativePath;
      try {
        await deleteFileViaTinaCMS(relativePath);
        console.log(`🗑️ Deleted: ${relativePath}`);
      } catch (error) {
        console.warn(`⚠️ Failed to delete ${relativePath}:`, error);
      }
    }
  };

  // Delete file via TinaCMS GraphQL
  const deleteFileViaTinaCMS = async (filePath: string) => {
    const clientId = config.clientId;
    const branch = config.branch;

    if (!clientId || !branch) {
      throw new Error("Missing TinaCMS configuration for file deletion");
    }

    const tinacmsAuthString = localStorage.getItem("tinacms-auth");
    let token;
    try {
      const authData = tinacmsAuthString ? JSON.parse(tinacmsAuthString) : null;
      token = authData?.id_token || config.token;
    } catch (e) {
      token = config.token;
    }

    const tinaEndpoint = `https://content.tinajs.io/1.5/content/${clientId}/github/${branch}`;

    const mutation = `
      mutation DeleteDocument($collection: String!, $relativePath: String!) {
        deleteDocument(collection: $collection, relativePath: $relativePath) {
          __typename
        }
      }
    `;

    const variables = {
      collection: "docs",
      relativePath: filePath,
    };

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (token) {
      headers["Authorization"] = "Bearer " + token;
    }

    const response = await fetch(tinaEndpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        query: mutation,
        variables: variables,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    if (result.errors) {
      throw new Error(result.errors.map((e: any) => e.message).join(", "));
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-md p-7 my-5 max-w-xl w-full border border-gray-200 font-sans">
      <div className="mb-6">
        <label className="font-bold text-slate-800 text-base mb-2 block">
          API Schema
        </label>
        <select
          value={selectedSchema}
          onChange={handleSchemaChange}
          disabled={loadingSchemas}
          className="w-full px-4 py-2 rounded-lg border border-slate-300 text-base bg-slate-50 mb-2 focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-50"
        >
          <option value="">
            {loadingSchemas
              ? "Loading schemas..."
              : schemas.length === 0
              ? "No schemas available"
              : "Select a schema"}
          </option>
          {schemas.map((schema) => (
            <option key={schema.id} value={schema.filename}>
              {schema.displayName}
            </option>
          ))}
        </select>
        {!loadingSchemas && schemas.length === 0 && (
          <div className="text-red-600 text-sm mt-1">
            ⚠️ No API schemas found. This might be due to:
            <br />
            • Missing TinaCMS client generation on staging
            <br />
            • Missing schema files deployment
            <br />
            • Environment configuration issues
            <br />
            <br />
            Please ensure schema files are uploaded to the "API Schema"
            collection.
          </div>
        )}
      </div>
      {selectedSchema && (
        <div className="mb-6">
          <label className="font-bold text-slate-800 text-base mb-2 block">
            Group/Tag
          </label>
          <select
            value={selectedTag}
            onChange={handleTagChange}
            disabled={loadingTags}
            className="w-full px-4 py-2 rounded-lg border border-slate-300 text-base bg-slate-50 mb-2 focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-50"
          >
            <option value="">
              {loadingTags ? "Loading tags..." : "Select a tag"}
            </option>
            {tags.map((tag) => (
              <option key={tag} value={tag}>
                {tag}
              </option>
            ))}
          </select>
        </div>
      )}
      {selectedTag && (
        <div>
          <div className="flex items-center mb-3">
            <label className="font-bold text-slate-800 text-base mr-4">
              Endpoints
            </label>
            <button
              type="button"
              onClick={handleSelectAll}
              disabled={loadingEndpoints}
              className="ml-auto px-4 py-1.5 rounded-md bg-blue-600 text-white font-semibold text-sm shadow hover:bg-blue-700 transition-colors border border-blue-700 disabled:opacity-50"
            >
              Select All
            </button>
          </div>
          {loadingEndpoints ? (
            <div className="text-slate-400 text-sm mb-4">
              Loading endpoints...
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-64 overflow-y-auto overflow-x-auto border border-gray-200 rounded-lg bg-slate-50 p-4 mb-4">
              {endpoints.map((ep) => (
                <label
                  key={ep.id}
                  className={`flex items-center rounded-md px-2 py-2 cursor-pointer transition-colors border ${
                    selectedEndpoints.some((selected) => selected.id === ep.id)
                      ? "bg-indigo-50 border-indigo-400 shadow"
                      : "bg-white border-gray-200"
                  } hover:bg-indigo-100`}
                >
                  <input
                    type="checkbox"
                    checked={selectedEndpoints.some(
                      (selected) => selected.id === ep.id
                    )}
                    onChange={() => handleEndpointCheckbox(ep.id)}
                    className="accent-indigo-600 w-5 h-5 mr-3 cursor-pointer"
                  />
                  <span
                    className="text-slate-700 text-sm font-medium truncate"
                    style={{ maxWidth: "14rem", display: "inline-block" }}
                    title={ep.label}
                  >
                    {ep.label}
                  </span>
                </label>
              ))}
              {endpoints.length === 0 && (
                <div className="text-slate-400 text-sm col-span-2">
                  No endpoints found for this tag.
                </div>
              )}
            </div>
          )}

          {/* Form Save Generation Status */}
          {selectedEndpoints.length > 0 && (
            <div className="mb-4 p-3 bg-green-50 rounded-lg border border-green-200">
              {generatingFiles ? (
                <div className="flex items-center text-green-700">
                  <span className="inline-block mr-2 animate-spin">⏳</span>
                  <span className="text-sm font-medium">
                    {isLocalMode
                      ? "Generating MDX files locally..."
                      : "Creating files via TinaCMS..."}
                  </span>
                </div>
              ) : (
                <div className="text-green-700">
                  <div className="flex items-center mb-1">
                    <span className="inline-block mr-2">💾</span>
                    <span className="text-sm font-medium">
                      Ready for Save & Generate
                    </span>
                  </div>
                  <div className="text-xs text-green-600">
                    {selectedEndpoints.length} endpoint
                    {selectedEndpoints.length !== 1 ? "s" : ""} selected - files
                    will be generated when you save this form using{" "}
                    {isLocalMode ? "filesystem method" : "TinaCMS GraphQL"}
                    <br />
                    🗑️ Will clear entire "{selectedTag}" directory and
                    regenerate all files
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="mt-2 p-3 bg-gray-100 rounded text-xs text-gray-700 font-mono break-all overflow-x-auto whitespace-pre">
            {JSON.stringify(
              {
                schema: selectedSchema,
                tag: selectedTag,
                endpoints: selectedEndpoints,
              },
              null,
              2
            )}
          </div>
        </div>
      )}
    </div>
  );
});

export default GroupOfApiReferencesSelector;
