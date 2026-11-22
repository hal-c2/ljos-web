// An edit that fails as its module loads.
function failed(): never {
    throw new Error("this board cannot load")
}

export const lanes = failed()
