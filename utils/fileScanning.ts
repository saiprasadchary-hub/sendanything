
// Utility to scan directories recursively
export interface FileItem {
    file: File;
    path: string;
}

// Utility to scan directories recursively
export const scanFiles = async (items: DataTransferItemList): Promise<FileItem[]> => {
    const files: FileItem[] = [];

    // Helper to scan a single entry
    const scanEntry = async (entry: any, path: string = ''): Promise<void> => {
        if (entry.isFile) {
            await new Promise<void>((resolve) => {
                entry.file((file: File) => {
                    // If path is empty, it's a top-level file, so use just the name.
                    // If path is not empty, it means we are in a folder, so append name.
                    // Actually, for consistency, let's always use the full relative path if possible.
                    // But if it's a top level drag, path is empty string initially.
                    // We want to construct relative paths.
                    // If I drag "folder", entry name is "folder". path is "".
                    // Recurse with path "folder/".
                    // Inside, file "test.txt". Full path "folder/test.txt".

                    // If I drag "file.txt", entry name "file.txt". path "".
                    // We just want the final path to be relative to the "root of the drag".
                    // Standard practice: if single file dragged, path is filename.
                    // If folder dragged, path is foldername/filename.

                    const fullPath = path + file.name;
                    files.push({ file, path: fullPath });
                    resolve();
                });
            });
        } else if (entry.isDirectory) {
            const reader = entry.createReader();
            const readEntries = async (): Promise<void> => {
                const entries = await new Promise<any[]>((resolve, reject) => {
                    reader.readEntries((entries: any[]) => resolve(entries), (err: any) => reject(err));
                });

                if (entries.length > 0) {
                    await Promise.all(entries.map((childEntry: any) => scanEntry(childEntry, path + entry.name + '/')));
                    await readEntries(); // Continue reading
                }
            };
            await readEntries();
        }
    };

    const promises: Promise<void>[] = [];
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === 'file') {
            const entry = item.webkitGetAsEntry();
            if (entry) {
                // For the top level items, we don't prefix with a path yet, 
                // but we need to handle if it's a directory or file.
                // If it is a directory, it will recurse and add its own name to the path.
                // If it is a file, it will add its name.
                // However, scanEntry logic above: 
                // - if file: path + file.name. If path is '', it's just name. Correct.
                // - if dir: recurses with path + entry.name + '/'. Correct.
                promises.push(scanEntry(entry, ''));
            } else {
                // Fallback for non-webkit
                const file = item.getAsFile();
                if (file) files.push({ file, path: file.name });
            }
        }
    }

    await Promise.all(promises);
    return files;
};
