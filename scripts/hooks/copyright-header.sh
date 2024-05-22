#!/usr/bin/env sh

if [ $# -lt 1 ]; then
    echo "usage: $(basename "$0") sourcefile ..." >&2
    exit 1
fi

tmp="/tmp/$(basename "$0")$$.tmp"

status=0
year="$(date '+%Y')"
for f in "$@"; do
    if [ ! -f "$f" ]; then
        echo "$(basename "$0"): Missing source file \"$f\"." >&2
        status=2
    fi

    ext="${f##*.}"

    body_template="Copyright 2009-YEAR C3 AI (www.c3.ai). All Rights Reserved.
This material, including without limitation any software, is the confidential trade secret and proprietary
information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
This material may be covered by one or more patents or pending patent applications."
    body=$(echo "$body_template" | sed "s/YEAR/$year/")

    # before_comment: line to prepend to the actual comment body (can be a comment "opening" like "/*" in Java)
    # line_start: prefix for each line
    # after_comment: line to append to the actual comment body (e.g. " */" to close a comment in Java)
    # header_re: regex that matches the comment header; used to remove previously added header from file

    if [ "$ext" = py ]; then
        before_comment=""
        line_start="#"
        after_comment=""
        header_re='s/^(#[ \r\n])*#[ \r\n*]*Copyright.*?[ \t\n]*[\r\n]{2,}//s'
    else
        before_comment="/*"
        line_start=" *"
        after_comment=" */"
        header_re='s,^/\*[ \r\n*]*Copyright.*?\*+/ *[ \t\n]*,,s'
    fi

    # Write template to file
    if [ "$before_comment" ]; then
        echo "$before_comment" > "$tmp"
    else
        # erase the content of $tmp
        truncate -s 0 "$tmp"
    fi
    echo "$body" | while read line; do
        echo "$line_start" "$line" >> "$tmp"
    done
    if [ "$after_comment" ]; then
        echo "$after_comment" >> "$tmp"
    fi
    echo "" >> "$tmp"  # add empty line after copyright comment
    if [ "$ext" = py ]; then
        echo "" >> "$tmp"  # add another empty line after copyright comment for Python
    fi
    # append body of existing file to the new copyright header creating an up-to-date file
    perl -0777 -pe "$header_re" "$f" >> "$tmp"
    mv -f "$tmp" "$f"
done

exit $status
