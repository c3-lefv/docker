#!/usr/bin/env bash

# Linting of c3typ files

ISSUE_FOUND=0

for FILE in "$@"; do
    ##
    # Warn about undocumented fields/methods.
    ##
    UNDOCUMENTED_FIELDS=$(grep -v "^\s*$" "$FILE" | grep -v "^\s*@" | grep -v "\~" | grep -B 1 "^\s\{2\}[A-Za-z]" | perl -e \
'my $count = 0; my $n=0;
while (<>) {
if ($keepPrinting == 0) {
$keepPrinting = 1;
$count++;
next;
}
my $line = $_;
chomp($line);
if (!$n) {
$line = "--".$line;
$n++;
}
if ($line =~ /^--/) {
$count=0;
$keepPrinting = 1;
}
if ( $line =~ m/^\s*[\*\/]/) {
$count++;
$keepPrinting=0;
next;
} else {
$keepPrinting=1;
}
if ($keepPrinting) {
print "$line\n";
}
$count++;
}' | grep -v "^--" | awk -F':' '{print $1}')

    if [ -n "$UNDOCUMENTED_FIELDS" ]; then
        echo "Undocumented field ${UNDOCUMENTED_FIELDS// /} in $FILE"
        ISSUE_FOUND=1
    fi

    # "\w\+\s*:\s*[\"|']" include `name : "some value"` and `name : 'some value'`
    # "^\s*//" exclude comments started with //
    # "^\s*\*[^/]" exclude comments started with *, but include */
    # "^\s*/\*" exclude comments start with /*
    # "^\([^:]*[\"|'][^\"|']*:[^\"|']*[\"|'][^:]*\)\+$" exclude : in quotes
    # "^\([^:]*[\"|'][^\"|']*:[^\"|']*[\"|'][^:]*\)\+/[/|\*]" exclude : in quotes before comments
    BAD_ANNOTATIONS=$(grep "\w\+\s*:\s*[\"|']" "$FILE" | grep -v "^\s*//" | grep -v "^\s*\*[^/]" | grep -v "^\s*/\*" | grep -v "^\([^:]*[\"|'][^\"|']*:[^\"|']*[\"|'][^:]*\)\+$" | grep -v "^\([^:]*[\"|'][^\"|']*:[^\"|']*[\"|'][^:]*\)\+/[/|\*]")
    if [ -n "$BAD_ANNOTATIONS" ]; then
      echo "Please change annotations from name:'value' to name='value' in $FILE"
      echo "$BAD_ANNOTATIONS"
      ISSUE_FOUND=1
    fi
done

exit $ISSUE_FOUND
