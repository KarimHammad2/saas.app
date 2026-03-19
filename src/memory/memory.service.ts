import { ProjectService } from "@/src/memory/project.service";
import { UpdateService } from "@/src/memory/update.service";
import { UserService } from "@/src/memory/user.service";
import type { ProjectRecord, ProjectStateDocument, StructuredProjectData, UserRecord } from "@/src/types/project.types";

export class MemoryService {
  private readonly users = new UserService();
  private readonly projects = new ProjectService();
  private readonly updates = new UpdateService();

  createUser(email: string): Promise<UserRecord> {
    return this.users.createUser(email);
  }

  getUserByEmail(email: string): Promise<UserRecord | null> {
    return this.users.getUserByEmail(email);
  }

  createProject(userId: string): Promise<ProjectRecord> {
    return this.projects.createProject(userId);
  }

  getProjectByUserId(userId: string): Promise<ProjectRecord | null> {
    return this.projects.getProjectByUserId(userId);
  }

  updateProject(projectId: string, structuredData: StructuredProjectData): Promise<void> {
    return this.projects.updateProject(projectId, structuredData);
  }

  getProjectState(projectId: string): Promise<ProjectStateDocument> {
    return this.projects.getProjectState(projectId);
  }

  storeUpdate(projectId: string, rawInput: string, structuredData: StructuredProjectData) {
    return this.updates.storeUpdate(projectId, rawInput, structuredData);
  }

  storeUserProfileContext(userId: string, context: Record<string, unknown>): Promise<void> {
    return this.updates.storeUserProfileContext(userId, context);
  }

  storeRPMSuggestion(projectId: string, suggestion: Record<string, unknown>): Promise<void> {
    return this.updates.storeRPMSuggestion(projectId, suggestion);
  }

  storeTransactionEvent(projectId: string, event: Record<string, unknown>): Promise<void> {
    return this.updates.storeTransactionEvent(projectId, event);
  }
}
