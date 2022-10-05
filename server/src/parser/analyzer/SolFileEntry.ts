import { Searcher } from "@analyzer/searcher";
import {
  Node,
  ISolFileEntry as ISolFileEntry,
  ASTNode,
  EmptyNode,
  Searcher as ISearcher,
  SolFileState,
  ClientTrackingState,
} from "@common/types";
import Project from "../../frameworks/base/Project";

export class SolFileEntry implements ISolFileEntry {
  public uri: string;
  public project: Project;
  public text: string | undefined;
  public status: SolFileState;
  public tracking: ClientTrackingState;

  public ast: ASTNode | undefined;
  public analyzerTree: { tree: Node };
  public searcher: ISearcher;
  public orphanNodes: Node[] = [];

  private constructor(uri: string, project: Project) {
    this.uri = uri;
    this.project = project;
    this.text = "";
    this.status = SolFileState.UNLOADED;
    this.tracking = ClientTrackingState.UNTRACKED;

    this.analyzerTree = {
      tree: new EmptyNode(
        { type: "Empty" },
        this.uri,
        this.project.basePath,
        {}
      ),
    };

    this.searcher = new Searcher(this.analyzerTree);
  }

  public static createUnloadedEntry(uri: string, project: Project) {
    return new SolFileEntry(uri, project);
  }

  public static createLoadedUntrackedEntry(
    uri: string,
    project: Project,
    text: string
  ): ISolFileEntry {
    const unloaded = new SolFileEntry(uri, project);

    return unloaded.loadText(text);
  }

  public static createLoadedTrackedEntry(
    uri: string,
    project: Project,
    text: string
  ): ISolFileEntry {
    const unloaded = new SolFileEntry(uri, project);
    const loaded = unloaded.loadText(text);
    return loaded.track();
  }

  public loadText(text: string) {
    this.status = SolFileState.LOADED;
    this.text = text;

    return this;
  }

  public track(): ISolFileEntry {
    this.tracking = ClientTrackingState.TRACKED;

    return this;
  }

  public untrack(): ISolFileEntry {
    this.tracking = ClientTrackingState.UNTRACKED;

    return this;
  }

  public isAnalyzed(): boolean {
    return this.status === SolFileState.ANALYZED;
  }
}
