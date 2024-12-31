import { GoogleGenerativeAI } from '@google/generative-ai';
import * as vscode from 'vscode';
import { Change } from './tracker';
import * as path from 'path';
interface AIAnalysis {
    codeQuality: {
        complexityTrends: Array<{ file: string; change: number; score: number }>;
        overallHealth: number;
    };
    changePatterns: {
        distribution: {
            featureDevelopment: number;
            refactoring: number;
            bugFixes: number;
        };
        impactAreas: Array<{
            area: string;
            level: 'High' | 'Medium' | 'Low';
            trend: '⬆️' | '➡️' | '⬇️';
        }>;
    };
    productivityMetrics: {
        velocity: {
            linesPerHour: number;
            percentChange: number;
            featuresPerWeek: number;
            trend: string;
        };
        codeReusability: {
            sharedComponents: number;
            potentialReuse: number;
        };
    };
    riskAssessment: {
        highPriority: string[];
        mediumPriority: string[];
    };
    recommendations: {
        immediate: string[];
        longTerm: string[];
    };
    technicalDebt: {
        score: number;
        areas: {
            documentation: number;
            testCoverage: number;
            codeDuplication: number;
        };
    };
    predictiveAnalysis: {
        estimatedCompletion: string;
        resourceUtilization: string;
        scalingConsiderations: string;
    };
}

export class AIAnalysisService {
    private client: GoogleGenerativeAI | null = null;

    constructor(private outputChannel: vscode.OutputChannel) {
        this.initializeAI();
    }

    private async initializeAI() {
        try {
            const config = vscode.workspace.getConfiguration('devtrack');
            const apiKey = config.get<string>('aiApiKey');

            if (!apiKey) {
                await this.promptForApiKey();
                return;
            }

            this.client = new GoogleGenerativeAI(apiKey);
        } catch (error) {
            this.outputChannel.appendLine(`AI initialization error: ${error}`);
        }
    }

    private async promptForApiKey() {
        const apiKey = await vscode.window.showInputBox({
            prompt: 'Enter your Google AI API Key to enable AI insights',
            password: true,
            ignoreFocusOut: true
        });

        if (apiKey) {
            const config = vscode.workspace.getConfiguration('devtrack');
            await config.update('aiApiKey', apiKey, true);
            this.client = new GoogleGenerativeAI(apiKey);
        }
    }
    private async getFileContent(uri: vscode.Uri): Promise<string> {
        try {
            const document = await vscode.workspace.openTextDocument(uri);
            return document.getText();
        } catch (error) {
            return '';
        }
    }

    private cleanResponse(response: string): string {
        return response
            .replace(/```json\n?/g, '')
            .replace(/```\n?/g, '')
            .replace(/[\u200B-\u200D\uFEFF]/g, '')
            .replace(/\*\*/g, '')
            .replace(/\*/g, '')
            .replace(/^[^[{]*/, '')
            .replace(/[^}\]]*$/, '')
            .trim();
    }


    async analyzeChanges(changes: Change[]): Promise<AIAnalysis> {
        if (!this.client) {
          throw new Error('AI service not initialized. Please configure API key in settings.');
        }
    
        try {
          const model = this.client.getGenerativeModel({ model: 'gemini-pro' });
    
          const fileContents = await Promise.all(
            changes.map(async (change) => ({
              file: path.basename(change.uri.fsPath),
              type: change.type,
              content: await this.getFileContent(change.uri)
            }))
          );

         
    
          const prompt = `
Analyze the provided code changes and generate a detailed AI report in JSON format. Use the following guidelines to ensure all fields are populated with meaningful and reasonable data:

### Input Structure:

- Each file has:
  - File name
  - Type of change (added, modified, deleted)
  - Content of the file (if available)
- Provide insights about the impact of changes, code quality, and productivity metrics.

### Expected Output JSON Format:

{
  "codeQuality": {
    "complexityTrends": [
      {"file": string, "change": number, "score": number}
    ],
    "overallHealth": number
  },
  "changePatterns": {
    "distribution": {
      "featureDevelopment": number,
      "refactoring": number,
      "bugFixes": number
    },
    "impactAreas": [
      {"area": string, "level": "High"|"Medium"|"Low", "trend": "⬆️"|"➡️"|"⬇️"}
    ]
  },
  "productivityMetrics": {
    "velocity": {
      "linesPerHour": number,
      "percentChange": number,
      "featuresPerWeek": number,
      "trend": string
    },
    "codeReusability": {
      "sharedComponents": number,
      "potentialReuse": number
    }
  },
  "riskAssessment": {
    "highPriority": string[],
    "mediumPriority": string[]
  },
  "recommendations": {
    "immediate": string[],
    "longTerm": string[]
  },
  "technicalDebt": {
    "score": number,
    "areas": {
      "documentation": number,
      "testCoverage": number,
      "codeDuplication": number
    }
  },
  "predictiveAnalysis": {
    "estimatedCompletion": string,
    "resourceUtilization": string,
    "scalingConsiderations": string
  }
}

### Analysis Instructions:

1. **Code Quality:**
   - Assess complexity trends based on the content of each file.
   - Score complexity changes using cyclomatic complexity and code maintainability indices.
   - Assign an overall health score to the codebase on a scale of 1-100, where higher is better.

2. **Change Patterns:**
   - Categorize changes into feature development, refactoring, and bug fixes based on file names, content, and change descriptions.
   - Identify high, medium, and low-impact areas with associated trends.

3. **Productivity Metrics:**
   - Calculate lines of code changed per hour and compare with historical data.
   - Estimate weekly feature velocity based on changes.
   - Analyze the proportion of shared components and their potential reuse in other areas.

4. **Risk Assessment:**
   - Highlight high-priority and medium-priority risks based on changes that may introduce instability or require further attention.

5. **Recommendations:**
   - Provide immediate actions (e.g., add tests, refactor complex code).
   - Suggest long-term improvements (e.g., improve documentation, increase test coverage).

6. **Technical Debt:**
   - Estimate the current technical debt score (1-100 scale) based on code quality and other factors.
   - Highlight specific areas like documentation, test coverage, and code duplication with percentages.

7. **Predictive Analysis:**
   - Provide estimated completion time for the project.
   - Suggest resource utilization strategies and scalability considerations.

### Example Input:

${JSON.stringify(fileContents, null, 2)}

### Output Requirements:
- Populate all fields with reasonable data based on the input.
- If exact data is unavailable, make assumptions based on typical development patterns.
- Ensure output JSON is valid and adheres to the specified format.
`;




          
          const result = await model.generateContent(prompt);
          const responseText = result.response.text();
          const cleanedResponse = this.cleanResponse(responseText);
    
          if (!cleanedResponse.startsWith('{') || !cleanedResponse.endsWith('}')) {
            throw new Error('Invalid JSON structure in AI response');
          }
    
          return JSON.parse(cleanedResponse);
        } catch (error) {
          this.outputChannel.appendLine(`AI Analysis error: ${error}`);
          throw error;
        }
      }

    formatAnalysisForReadme(analysis: AIAnalysis): string {
        try {
          let content = '\n## 🧠 Advanced AI Insights\n\n';
    
          // Code Quality Analysis
          content += '### 📊 Code Quality Analysis\n';
          content += '- **Complexity Trends**\n';
          analysis.codeQuality.complexityTrends.forEach(trend => {
            content += `  - \`${trend.file}\`: ${trend.change > 0 ? 'Increased' : 'Decreased'} complexity by ${Math.abs(trend.change)}% (Score: ${trend.score})\n`;
          });
          content += `- Overall codebase health: ${analysis.codeQuality.overallHealth}/100\n\n`;
    
          // Change Patterns
          content += '### 🔄 Change Patterns\n';
          content += '- **Type Distribution**\n';
          content += `  - ${analysis.changePatterns.distribution.featureDevelopment}% Feature Development\n`;
          content += `  - ${analysis.changePatterns.distribution.refactoring}% Refactoring\n`;
          content += `  - ${analysis.changePatterns.distribution.bugFixes}% Bug Fixes\n`;
          content += '- **Impact Areas**\n';
          analysis.changePatterns.impactAreas.forEach(area => {
            content += `  - ${area.area}: ${area.trend} ${area.level}\n`;
          });
          content += '\n';
    
          // Productivity Metrics
          content += '### 📈 Productivity Metrics\n';
          content += '- **Development Velocity**\n';
          content += `  - Lines/Hour: ${analysis.productivityMetrics.velocity.linesPerHour} (${analysis.productivityMetrics.velocity.percentChange > 0 ? '↑' : '↓'}${Math.abs(analysis.productivityMetrics.velocity.percentChange)}% from average)\n`;
          content += `  - Features/Week: ${analysis.productivityMetrics.velocity.featuresPerWeek} (${analysis.productivityMetrics.velocity.trend})\n`;
          content += '- **Code Reusability**\n';
          content += `  - Shared Components: ${analysis.productivityMetrics.codeReusability.sharedComponents}%\n`;
          content += `  - Potential for Reuse: ${analysis.productivityMetrics.codeReusability.potentialReuse}%\n\n`;
    
          // Risk Assessment
          content += '### ⚠️ Risk Assessment\n';
          content += '- **High Priority**\n';
          analysis.riskAssessment.highPriority.forEach(risk => {
            content += `  - ${risk}\n`;
          });
          content += '- **Medium Priority**\n';
          analysis.riskAssessment.mediumPriority.forEach(risk => {
            content += `  - ${risk}\n`;
          });
          content += '\n';
    
          // Recommendations
          content += '### 💡 Recommendations\n';
          content += '1. **Immediate Actions**\n';
          analysis.recommendations.immediate.forEach(rec => {
            content += `   - ${rec}\n`;
          });
          content += '\n2. **Long-term Improvements**\n';
          analysis.recommendations.longTerm.forEach(rec => {
            content += `   - ${rec}\n`;
          });
          content += '\n';
    
          // Technical Debt
          content += '### 📉 Technical Debt\n';
          content += `- Current Debt Score: ${analysis.technicalDebt.score}/100\n`;
          content += '- Key Areas:\n';
          content += `  - Documentation: ${analysis.technicalDebt.areas.documentation}% coverage\n`;
          content += `  - Test Coverage: ${analysis.technicalDebt.areas.testCoverage}%\n`;
          content += `  - Code Duplication: ${analysis.technicalDebt.areas.codeDuplication}%\n\n`;
    
          // Predictive Analysis
          content += '### 🔮 Predictive Analysis\n';
          content += `- Estimated completion time: ${analysis.predictiveAnalysis.estimatedCompletion}\n`;
          content += `- Resource utilization: ${analysis.predictiveAnalysis.resourceUtilization}\n`;
          content += `- Scaling considerations: ${analysis.predictiveAnalysis.scalingConsiderations}\n`;
    
          return content;
        } catch (error) {
          this.outputChannel.appendLine(`Error formatting AI analysis: ${error}`);
          return '\n### ⚠️ AI Analysis Unavailable\nAI insights could not be generated. Please check your API key configuration.\n';
        }
      }
}