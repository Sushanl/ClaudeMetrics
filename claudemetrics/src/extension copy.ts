// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { diffLines } from 'diff';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {

    const config = vscode.workspace.getConfiguration();
    const email = await getEmail();
    const githubUsername = await getGithubUsername();




    const logDir = path.join(os.homedir(), ".claude", "projects");

    // Check if Claude logs directory exists
    if (!fs.existsSync(logDir)) {
        vscode.window.showErrorMessage(`ClaudeMetrics: Claude logs directory not found at ${logDir}`);
        return;
    }

    vscode.window.showInformationMessage("ClaudeMetrics: Watching claude logging");
    vscode.window.showInformationMessage("🚀 ClaudeMetrics activated");
    console.log('Congratulations, your extension "claudemetrics" is now active!');

    
    fileWatcher();


    async function getEmail() {
        const email = config.get<string>('claudeMetrics.email');
        if (!email) {

            const emailInput = await vscode.window.showInputBox({
                prompt: 'Please enter your email for Claude Metrics tracking',
                placeHolder: "example@gmail.com",
            });

            if (!emailInput) {
                vscode.window.showErrorMessage("ClaudeMetrics: Email setup failed. Please retry in command pallette.");
                return email || "";
            }

            config.update('claudeMetrics.email', emailInput, vscode.ConfigurationTarget.Global);
            return emailInput;
        }
        return email;
    }

    async function getGithubUsername() {
        const githubUsername = config.get<string>('claudeMetrics.githubUsername');

        if (!githubUsername) {
            const gitInput = await vscode.window.showInputBox({
                prompt: 'Please enter your github username for Claude Metrics tracking',
                placeHolder: "John Doe",
            });
            if (!gitInput) {
                vscode.window.showErrorMessage("ClaudeMetrics: Github username setup failed. Please retry in command pallette.");
                return email || "";
            }
            config.update('claudeMetrics.githubUsername', gitInput, vscode.ConfigurationTarget.Global);
            return gitInput;
        }
        return githubUsername;
    }

    //File watcher - watch for changes in Claude projects directory
    async function fileWatcher() {
        try {
            console.log(`ClaudeMetrics: Starting to watch directory: ${logDir}`);
    
            const watcher = fs.watch(logDir, { recursive: true }, (eventType, filename) => {
                console.log(`ClaudeMetrics: Raw file event - Type: ${eventType}, File: ${filename}`);
    
                if (filename?.endsWith(".jsonl")) {
                    const filePath = path.join(logDir, filename);
                    console.log(`ClaudeMetrics: JSONL file event ${eventType} for ${filename}`);
                    console.log(`ClaudeMetrics: Full path: ${filePath}`);
    
                    // Handle both 'rename' (file created/moved) and 'change' (file modified) events
                    if (eventType === 'rename' || eventType === 'change') {
                        setTimeout(() => handleNewLogFile(filePath, email, githubUsername), 1000);
                    }
                }
            });
    
            // Also process any existing files on startup
            const existingFiles = fs.readdirSync(logDir, { recursive: true }) as string[];
            const jsonlFiles = existingFiles.filter(file => file.endsWith('.jsonl'));
            console.log(`ClaudeMetrics: Found ${jsonlFiles.length} existing JSONL files:`, jsonlFiles);
    
            // Cleanup watcher when extension is deactivated
            context.subscriptions.push({ dispose: () => watcher.close() });
        } catch (error) {
            vscode.window.showErrorMessage(`ClaudeMetrics: Failed to watch directory: ${error}`);
            console.error(`ClaudeMetrics: Watch error:`, error);
        }
    }
}



function handleNewLogFile(filePath: string, email: string, githubUsername: string) {
    try {
        const rawLog = fs.readFileSync(filePath, "utf-8");
        console.log(`ClaudeMetrics - User: ${email}, GitHub: ${githubUsername}`);

        // Parse JSONL and extract AI code suggestions/edits
        const lines = rawLog.trim().split('\n').filter(line => line.trim());
        let totalLinesEdited = 0;
        let totalLinesSuggested = 0;
        let suggestionsAccepted = 0;
        let suggestionsDeclined = 0;

        // Track tool uses and their results
        const toolUseMap = new Map();

        lines.forEach((line, index) => {
            try {
                const logEntry = JSON.parse(line);

                // First pass: collect tool uses
                if (logEntry.message && logEntry.message.role === 'assistant' && logEntry.message.content) {
                    const toolUses = logEntry.message.content.filter((item: any) => item.type === 'tool_use');

                    toolUses.forEach((tool: any) => {
                        toolUseMap.set(tool.id, {
                            tool: tool,
                            successful: false, // Will be updated when we find the result
                            logIndex: index
                        });

                        let linesInThisTool = 0;

                        if (tool.name === 'Edit') {
                            // Calculate actual line changes using diff
                            // Accounts for replacement lines
                            if (tool.input.old_string && tool.input.new_string) {
                                const diff = diffLines(tool.input.old_string, tool.input.new_string);
                                let changedLines = 0;
                                

                                diff.forEach((part, index) => {
                                    if (part.added) {
                                        changedLines += part.count || 0;
                                    } else if (part.removed) {
                                        if (diff[index + 1] && diff[index + 1].added) {
                                            return;
                                        } else {
                                            changedLines += part.count || 0;
                                        }
                                        
                                    }
                                });

                                linesInThisTool = changedLines;
                                totalLinesSuggested += linesInThisTool;
                            }
                        } else if (tool.name === 'MultiEdit') {
                            // For multi-edits, sum up all the actual changes using diff
                            if (tool.input.edits) {
                                tool.input.edits.forEach((edit: any) => {
                                    if (edit.old_string && edit.new_string) {
                                        const diff = diffLines(edit.old_string, edit.new_string);
                                        let editChangedLines = 0;

                                        diff.forEach(part => {
                                            if (part.added || part.removed) {
                                                editChangedLines += part.count || 0;
                                            }
                                        });

                                        linesInThisTool += editChangedLines;
                                        totalLinesSuggested += editChangedLines;
                                    }
                                });
                            }
                        } else if (tool.name === 'Write') {
                            // Count lines in new files (all new content)
                            if (tool.input.content) {
                                linesInThisTool = tool.input.content.split('\n').length;
                                totalLinesSuggested += linesInThisTool;
                            }
                        }

                        // Store line count for potential editing count later
                        toolUseMap.get(tool.id).linesCount = linesInThisTool;
                    });

                    // Count lines in text responses that contain code blocks
                    const textContent = logEntry.message.content.filter((item: any) => item.type === 'text');
                    textContent.forEach((textItem: any) => {
                        const codeBlocks = textItem.text.match(/```[\s\S]*?```/g);
                        if (codeBlocks) {
                            codeBlocks.forEach((block: string) => {
                                const codeLines = block.split('\n').length - 2; // Exclude ``` lines
                                totalLinesSuggested += Math.max(0, codeLines);
                            });
                        }
                    });
                }

                // Second pass: check tool results for success/failure
                if (logEntry.message && logEntry.message.role === 'user' && logEntry.message.content) {
                    const toolResults = logEntry.message.content.filter((item: any) => item.type === 'tool_result');

                    toolResults.forEach((result: any) => {
                        if (toolUseMap.has(result.tool_use_id)) {
                            const toolInfo = toolUseMap.get(result.tool_use_id);
                            const isSuccessful = !result.is_error;
                            toolInfo.successful = isSuccessful;

                            // Track acceptance/decline for all code-related tools
                            if (toolInfo.tool.name === 'Edit' || toolInfo.tool.name === 'MultiEdit' || toolInfo.tool.name === 'Write') {
                                if (isSuccessful) {
                                    suggestionsAccepted++;

                                    // Only count Edit/MultiEdit as "edited" lines
                                    if (toolInfo.tool.name === 'Edit' || toolInfo.tool.name === 'MultiEdit') {
                                        totalLinesEdited += toolInfo.linesCount;
                                    }

                                    console.log(`AI Code Action [${toolInfo.logIndex + 1}]:`, {
                                        tool: toolInfo.tool.name,
                                        linesCount: toolInfo.linesCount,
                                        status: 'ACCEPTED ✓',
                                        timestamp: logEntry.timestamp,
                                        filePath: toolInfo.tool.input.file_path || 'N/A'
                                    });
                                } else {
                                    suggestionsDeclined++;

                                    console.log(`AI Code Action [${toolInfo.logIndex + 1}]:`, {
                                        tool: toolInfo.tool.name,
                                        linesCount: toolInfo.linesCount,
                                        status: 'DECLINED ✗',
                                        timestamp: logEntry.timestamp,
                                        filePath: toolInfo.tool.input.file_path || 'N/A'
                                    });
                                }
                            }
                        }
                    });
                }
            } catch (parseErr) {
                // Skip invalid JSON lines
            }
        });

        const totalSuggestions = suggestionsAccepted + suggestionsDeclined;
        const acceptanceRate = totalSuggestions > 0 ? ((suggestionsAccepted / totalSuggestions) * 100).toFixed(1) : '0.0';

        console.log(`\n=== ClaudeMetrics Summary ===`);
        console.log(`User: ${email}, GitHub: ${githubUsername}`);
        console.log(`Total Lines Suggested: ${totalLinesSuggested} (all code Claude proposed)`);
        console.log(`Total Lines Edited: ${totalLinesEdited} (successfully applied changes)`);
        console.log(`\nSuggestion Acceptance:`);
        console.log(`  ✓ Accepted: ${suggestionsAccepted}`);
        console.log(`  ✗ Declined: ${suggestionsDeclined}`);
        console.log(`  📊 Acceptance Rate: ${acceptanceRate}%`);
        console.log(`===============================\n`);

    } catch (err) {
        vscode.window.showErrorMessage("Could not parse Claude file");
    }


}

// This method is called when your extension is deactivated
export function deactivate() { }
