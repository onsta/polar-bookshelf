import {Tag} from 'polar-shared/src/tags/Tags';
import {TagDescriptor} from "polar-shared/src/tags/TagDescriptors";
import {SetArrays} from "polar-shared/src/util/SetArrays";
import {ForwardTagToDocIDIndex} from "./ForwardTagToDocIDIndex";
import {ReverseDocIDToTagIndex} from "./ReverseDocIDToTagIndex";


class TagIndex {

    // tags to docs
    private forward = new ForwardTagToDocIDIndex();

    // docs to tags
    private reverse = new ReverseDocIDToTagIndex();

    public set(docID: string, tags: ReadonlyArray<Tag>) {

        // take a copy of the existing tabs before we remove them
        const existingTags = this.reverse.get(docID).toArray();

        // the forward mapping
        for (const tag of tags) {
            this.forward.get(tag).add(docID);
        }

        // the reverse mapping
        this.reverse.get(docID).set(tags.map(tag => tag.id));

        const removeTags = SetArrays.difference(existingTags,
                                                tags.map(tag => tag.id));

        for (const removeTag of removeTags) {

            const existingTagMembers = this.forward.getWithKey(removeTag);

            if (existingTagMembers) {
                existingTagMembers.delete(docID);
            }

        }

    }

    public delete(docID: string, tags: ReadonlyArray<Tag>) {

        for (const tag of tags) {

            const set = this.forward.get(tag);
            set.delete(docID);

            if (set.count() === 0) {
                this.forward.delete(tag.id);
            }

        }
    }

    public toTagDescriptors(): ReadonlyArray<TagDescriptor> {

        return this.forward.values().map(current => {

            return {
                ...current.key,
                count: current.count(),
                members: current.toArray()
            };

        });
    }

}

/**
 * Stores generic data objects like RepoDocInfo or RepoAnnotation and provides
 * generic tag structure metadata too.
 */
export class DataObjectIndex<D> {

    private index: {[id: string]: D} = {};

    private tags = new TagIndex();

    public constructor(private readonly toTags: (input?: D) => ReadonlyArray<Tag>) {

    }

    public put(key: string, data: D) {

        this.index[key] = data;
        const tags = this.toTags(data);
        this.tags.set(key, tags);

    }

    public delete(key: string) {
        const value = this.index[key];
        delete this.index[key];

        this.tags.delete(key, this.toTags(value));
    }

    public values(): ReadonlyArray<D> {
        return Object.values(this.index);
    }

    public size(): number {
        return Object.keys(this.index).length;
    }

    public toTagDescriptors() {
        return this.tags.toTagDescriptors();
    }

}
