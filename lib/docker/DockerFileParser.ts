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

import {File, FileParser} from "@atomist/automation-client";
import {TreeNode} from "@atomist/tree-path";

import {DockerfileParser, From, Instruction} from "dockerfile-ast";
import stringify = require("json-stringify-safe");
import {TextDocument} from "../../node_modules/vscode-languageserver-types/lib/umd/main";

export class DockerFileParser implements FileParser {

    public readonly rootName: "docker";

    public async toAst(f: File): Promise<TreeNode> {
        const dockerfile = DockerfileParser.parse(await f.getContent());
        // console.log(stringify(dockerfile));
        const doc = (dockerfile as any).document;
        return {
            $name: f.name,
            $children: dockerfile.getInstructions().map(i => toTreeNode(i, doc)),
        };
    }

}

function toTreeNode(l: Instruction, doc: TextDocument, parent?: TreeNode): TreeNode {
    const n: TreeNode = {
        $name: l.getKeyword(),
        $value: l.getTextContent(),
        $parent: parent,
        $offset: convertToOffset(l.getRange().start, doc),
    };
    if (isFrom(l)) {
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
    return n;
}

function isFrom(l: Instruction): l is From {
    const maybe = l as From;
    return !!maybe.getImageName;
}

function convertToOffset(pos: any, doc: TextDocument): number {
    return doc.offsetAt(pos);
}
