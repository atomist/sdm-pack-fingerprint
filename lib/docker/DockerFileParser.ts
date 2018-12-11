/*
 * Copyright © 2018 Atomist, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {
    FileParser,
    ProjectFile,
} from "@atomist/automation-client";
import {TreeNode} from "@atomist/tree-path";

import {
    DockerfileParser,
    From,
    Instruction,
} from "dockerfile-ast";
import {Position, TextDocument} from "vscode-languageserver-types/lib/umd/main";

class DockerFileParserClass implements FileParser {

    public readonly rootName: "docker";

    public async toAst(f: ProjectFile): Promise<TreeNode> {
        const dockerfile = DockerfileParser.parse(await f.getContent());
        // console.log(stringify(dockerfile));
        const doc = (dockerfile as any).document;
        return {
            $name: f.name,
            $children: dockerfile.getInstructions().map(i => instructionToTreeNode(i, doc)),
        };
    }

}

/**
 * FileParser instance to use for Docker files.
 * Example path expressions, given "node:argon" as the image
 *  //FROM/image/name - returns a node with the value "node" etc
 *  //FROM/image/tag - returns a node with the value "argon" etc
 * @type {DockerFileParserClass}
 */
export const DockerFileParser: FileParser = new DockerFileParserClass();

function instructionToTreeNode(l: Instruction, doc: TextDocument, parent?: TreeNode): TreeNode {
    const n: TreeNode = {
        $name: l.getKeyword(),
        $value: l.getTextContent(),
        $parent: parent,
        $offset: convertToOffset(l.getRange().start, doc),
    };

    // Deconstruct subelements. There is no generic tree structure in the
    // AST library, so we need to do this manually for subelements we care about.
    if (isFrom(l)) {
        addChildrenFromFromStructure(n, l, doc);
    }
    return n;
}

function isFrom(l: Instruction): l is From {
    const maybe = l as From;
    return !!maybe.getImageName;
}

// Deconstruct FROM to add children.
// We need to do this for all structures we want to see inside
function addChildrenFromFromStructure(n: TreeNode, l: From, doc: TextDocument) {
    n.$children = [{
        $parent: n,
        $name: "image",
        $value: l.getImage(),
        $offset: convertToOffset(l.getImageRange().start, doc),
        $children: [{
            $name: "name",
            $value: l.getImageName(),
            $offset: convertToOffset(l.getImageNameRange().start, doc),
        },
            {
                $name: "tag",
                $value: l.getImageTag(),
                $offset: convertToOffset(l.getImageTagRange().start, doc),
            }],
    }];
}

// Convert a position to an offset, given the document
function convertToOffset(pos: Position, doc: TextDocument): number {
    return doc.offsetAt(pos);
}
